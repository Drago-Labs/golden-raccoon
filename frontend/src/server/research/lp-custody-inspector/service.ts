import { getEvmNetwork } from "@/lib/evm/config";
import { decodeAddress, decodeReserves, decodeUint, encodeBalanceOf, SELECTORS } from "./abi";
import { createHttpLpRpc, type LpRpc } from "./rpc";
import { BURN_ADDRESSES, type Candidate, type CandidateClassification, type CandidateEvidence, type CustodySummary, type LpCustodyRequest, type LpCustodyResult, type PoolModel } from "./schema";

const BASIS_POINTS_SCALE = 10_000n;

function isBurnAddress(address: string): boolean {
  const lower = address.toLowerCase();
  return BURN_ADDRESSES.some((burn) => burn === lower);
}

function toBasisPoints(part: bigint, whole: bigint): number {
  if (whole <= 0n) return 0;
  return Number((part * BASIS_POINTS_SCALE) / whole);
}

async function readPool(rpc: LpRpc, pool: string, block: bigint) {
  const [token0Raw, token1Raw, totalSupplyRaw, reservesRaw] = await Promise.all([
    rpc.call(pool, SELECTORS.token0, block),
    rpc.call(pool, SELECTORS.token1, block),
    rpc.call(pool, SELECTORS.totalSupply, block),
    rpc.call(pool, SELECTORS.getReserves, block),
  ]);

  const token0 = token0Raw ? decodeAddress(token0Raw) : null;
  const token1 = token1Raw ? decodeAddress(token1Raw) : null;
  const totalSupply = decodeUint(totalSupplyRaw);
  const reserves = decodeReserves(reservesRaw);

  let model: PoolModel;
  if (!token0 || !token1) {
    model = "unknown_contract";
  } else if (totalSupply === null) {
    // token0/token1 exist (as on a Uniswap V3 pool) but there is no fungible
    // LP supply to attribute custody against — a concentrated-liquidity
    // position is an NFT, not a balance this feature can read this way.
    model = "concentrated_liquidity_unsupported";
  } else {
    model = "constant_product_v2";
  }

  return { model, token0, token1, totalSupply, reserves };
}

function classifyCandidate(candidate: Candidate): CandidateClassification {
  if (isBurnAddress(candidate.address)) return "burned";
  if (candidate.claimedUnlockTimestamp !== undefined) return "claimed_lock";
  return "unknown_holder";
}

function lockClaimStatus(candidate: Candidate, asOfSeconds: number): "claimed_future" | "claimed_past_or_expired" | "not_claimed" {
  if (candidate.claimedUnlockTimestamp === undefined) return "not_claimed";
  return candidate.claimedUnlockTimestamp > asOfSeconds ? "claimed_future" : "claimed_past_or_expired";
}

async function readCandidate(
  rpc: LpRpc,
  pool: string,
  candidate: Candidate,
  block: bigint,
  totalSupply: bigint | null,
  asOfSeconds: number,
): Promise<CandidateEvidence> {
  const raw = await rpc.call(pool, encodeBalanceOf(candidate.address), block);
  const balance = decodeUint(raw);
  const available = balance !== null;
  return {
    address: candidate.address,
    label: candidate.label ?? null,
    classification: classifyCandidate(candidate),
    balanceRaw: balance !== null ? balance.toString() : null,
    basisPoints: available && totalSupply !== null ? toBasisPoints(balance!, totalSupply) : null,
    lockClaim: {
      status: lockClaimStatus(candidate, asOfSeconds),
      unlockTimestamp: candidate.claimedUnlockTimestamp ?? null,
      verified: false,
    },
    available,
  };
}

function summarize(candidates: CandidateEvidence[], totalSupply: bigint | null): CustodySummary | null {
  if (totalSupply === null) return null;
  let burned = 0n;
  let claimedLocked = 0n;
  let otherIdentified = 0n;
  let accountedRaw = 0n;

  for (const candidate of candidates) {
    if (!candidate.available || candidate.balanceRaw === null) continue;
    const balance = BigInt(candidate.balanceRaw);
    accountedRaw += balance;
    if (candidate.classification === "burned") burned += balance;
    else if (candidate.classification === "claimed_lock") claimedLocked += balance;
    else otherIdentified += balance;
  }

  const unaccountedRaw = totalSupply > accountedRaw ? totalSupply - accountedRaw : 0n;

  return {
    burnedBasisPoints: toBasisPoints(burned, totalSupply),
    claimedLockedBasisPoints: toBasisPoints(claimedLocked, totalSupply),
    otherIdentifiedBasisPoints: toBasisPoints(otherIdentified, totalSupply),
    unaccountedBasisPoints: toBasisPoints(unaccountedRaw, totalSupply),
  };
}

export async function inspectLpCustody(
  input: LpCustodyRequest,
  deps: { rpc?: LpRpc; now?: () => number } = {},
): Promise<LpCustodyResult> {
  const config = getEvmNetwork(input.network);
  if (!config) throw new Error("Unsupported network");
  const rpc = deps.rpc ?? createHttpLpRpc(config.rpcUrl);
  const now = deps.now ?? (() => Date.now());
  const warnings: string[] = [];

  try {
    const block = input.blockNumber !== undefined ? BigInt(input.blockNumber) : await rpc.blockNumber();
    const snapshotHash = await rpc.blockHash(block);
    const pool = await readPool(rpc, input.poolAddress, block);

    const asOfSeconds = Math.floor(now() / 1000);
    const candidates: CandidateEvidence[] = [];
    let anyUnavailable = false;

    // Burn addresses are always checked, independent of what the caller
    // nominated: their coverage should never depend on the caller
    // remembering to list them.
    const suppliedAddresses = new Set(input.candidates.map((c) => c.address.toLowerCase()));
    const allCandidates: Candidate[] = [
      ...BURN_ADDRESSES.filter((burn) => !suppliedAddresses.has(burn)).map((address) => ({ address })),
      ...input.candidates,
    ];

    if (pool.model === "constant_product_v2") {
      for (const candidate of allCandidates) {
        const evidence = await readCandidate(rpc, input.poolAddress, candidate, block, pool.totalSupply, asOfSeconds);
        if (!evidence.available) anyUnavailable = true;
        candidates.push(evidence);
      }
    } else if (input.candidates.length > 0) {
      warnings.push("Candidate balances were not read: the pool model does not support a single fungible LP balance.");
    }

    const confirmedHash = await rpc.blockHash(block);
    const reorgDetected = Boolean(snapshotHash && confirmedHash && snapshotHash !== confirmedHash);
    if (reorgDetected) warnings.push("The requested block's hash changed during this read; results may reflect a stale chain view.");

    if (pool.model === "unknown_contract") warnings.push("The target does not expose token0()/token1(); it is not recognized as a two-asset pool.");
    if (pool.model === "concentrated_liquidity_unsupported") warnings.push("The target looks like a concentrated-liquidity pool; positions are NFTs, not a single fungible LP balance this tool can attribute.");
    if (input.candidates.length === 0 && pool.model === "constant_product_v2") warnings.push("Only burn addresses were checked: lock-contract coverage beyond that is unknown, not zero.");

    const summary = pool.model === "constant_product_v2" ? summarize(candidates, pool.totalSupply) : null;

    return {
      network: input.network,
      poolAddress: input.poolAddress,
      blockNumber: Number(block),
      state: anyUnavailable || reorgDetected ? "partial" : "complete",
      model: pool.model,
      token0: pool.token0,
      token1: pool.token1,
      reserves: pool.reserves
        ? { reserve0: pool.reserves.reserve0.toString(), reserve1: pool.reserves.reserve1.toString(), blockTimestampLast: pool.reserves.blockTimestampLast }
        : null,
      totalSupply: pool.totalSupply !== null ? pool.totalSupply.toString() : null,
      candidates,
      summary,
      reorgDetected,
      warnings,
    };
  } catch (error) {
    return {
      network: input.network,
      poolAddress: input.poolAddress,
      blockNumber: null,
      state: "unavailable",
      model: "unknown_contract",
      token0: null,
      token1: null,
      reserves: null,
      totalSupply: null,
      candidates: [],
      summary: null,
      reorgDetected: false,
      warnings: [error instanceof Error ? error.message : "Provider unavailable"],
    };
  }
}
