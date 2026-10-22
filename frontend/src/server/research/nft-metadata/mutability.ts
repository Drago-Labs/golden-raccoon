import { encodeFunctionData } from "viem";
import { METADATA_UPDATE_LOG_WINDOW_BLOCKS } from "./limits";
import { decodeBoolResult, readOwner, type NftRpc } from "./uriReader";

/**
 * keccak256 topic hashes for the ERC-4906 metadata-update events, verified
 * against viem's `toEventSelector`.
 */
export const METADATA_UPDATE_TOPICS = {
  metadataUpdate: "0xf8e1a15aba9398e019f0b49df1a4fde98ee17ae345cb5f6b5e2c27f5033e8ce7",
  batchMetadataUpdate: "0x6bd5c950a8d8df17f772f5af37cb3655737899cbf903264b9795592da439661c",
} as const;

/** A revert reason naming an access-control pattern proves the probed function exists, even though the caller was rejected. */
const ACCESS_CONTROL_REASON = /owner|unauthorized|access ?control|only ?owner|admin|not authorized|forbidden|caller is not/i;

export type MutabilitySignal = {
  /** Human-readable function signature probed. */
  name: string;
  detected: boolean;
  evidence: string;
};

export type MetadataUpdateScan = {
  fromBlock: string;
  toBlock: string;
  metadataUpdateCount: number;
  batchMetadataUpdateCount: number;
  truncated: boolean;
};

export type MutabilityResult = {
  owner: string | null;
  baseUriSetterSignals: MutabilitySignal[];
  freezeFlags: MutabilitySignal[];
  metadataUpdateScan: MetadataUpdateScan;
};

const setBaseUriAbi = [{ type: "function", name: "setBaseURI", stateMutability: "nonpayable", inputs: [{ type: "string" }], outputs: [] }] as const;
const setUriAbi = [{ type: "function", name: "setURI", stateMutability: "nonpayable", inputs: [{ type: "string" }], outputs: [] }] as const;
const setTokenUriAbi = [
  { type: "function", name: "setTokenURI", stateMutability: "nonpayable", inputs: [{ type: "uint256" }, { type: "string" }], outputs: [] },
] as const;

const SETTER_PROBES: Array<{ name: string; data: `0x${string}` }> = [
  { name: "setBaseURI(string)", data: encodeFunctionData({ abi: setBaseUriAbi, functionName: "setBaseURI", args: ["probe"] }) },
  { name: "setURI(string)", data: encodeFunctionData({ abi: setUriAbi, functionName: "setURI", args: ["probe"] }) },
  { name: "setTokenURI(uint256,string)", data: encodeFunctionData({ abi: setTokenUriAbi, functionName: "setTokenURI", args: [1n, "probe"] }) },
];

const metadataFrozenAbi = [{ type: "function", name: "metadataFrozen", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] }] as const;
const frozenAbi = [{ type: "function", name: "frozen", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] }] as const;
const isFrozenAbi = [{ type: "function", name: "isFrozen", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] }] as const;

const FREEZE_PROBES: Array<{ name: string; abi: typeof metadataFrozenAbi; functionName: "metadataFrozen" | "frozen" | "isFrozen" }> = [
  { name: "metadataFrozen()", abi: metadataFrozenAbi, functionName: "metadataFrozen" },
  { name: "frozen()", abi: frozenAbi, functionName: "frozen" },
  { name: "isFrozen()", abi: isFrozenAbi, functionName: "isFrozen" },
];

/**
 * Probes a bounded set of well-known base-URI-setter signatures. A call
 * that reverts with an access-control-flavored reason (e.g. Ownable's
 * default message) proves the function exists — a nonexistent selector
 * cannot produce that specific text under standard Solidity dispatcher
 * semantics. A call that merely succeeds, or reverts with no reason, is
 * genuinely ambiguous (a void-return setter that *does* exist looks
 * identical to a missing selector on most clients) and is reported as
 * not detected rather than guessed at. Custom-error-based access control
 * (newer OpenZeppelin `OwnableUnauthorizedAccount`) is not recognized by
 * this text-based heuristic — see the evidence doc.
 */
async function probeBaseUriSetters(rpc: NftRpc, address: string, block: bigint): Promise<MutabilitySignal[]> {
  return Promise.all(
    SETTER_PROBES.map(async ({ name, data }) => {
      const revertReason = await rpc.probeRevertReason(address, data, block);
      const detected = Boolean(revertReason && ACCESS_CONTROL_REASON.test(revertReason));
      return {
        name,
        detected,
        evidence: detected
          ? `reverted with an access-control reason: "${revertReason}"`
          : revertReason
            ? `reverted with an unrecognized reason: "${revertReason}"`
            : "call succeeded or reverted with no reason — no evidence either way",
      };
    }),
  );
}

async function probeFreezeFlags(rpc: NftRpc, address: string, block: bigint): Promise<MutabilitySignal[]> {
  return Promise.all(
    FREEZE_PROBES.map(async ({ name, abi, functionName }) => {
      const data = encodeFunctionData({ abi, functionName, args: [] });
      const raw = await rpc.call(address, data, block);
      const value = decodeBoolResult(raw);
      return {
        name,
        detected: value !== null,
        evidence: value === null ? "not present or did not return a bool" : value ? "present, reports frozen" : "present, reports not frozen",
      };
    }),
  );
}

async function scanMetadataUpdateEvents(rpc: NftRpc, address: string, latest: bigint, windowBlocks: bigint): Promise<MetadataUpdateScan> {
  const fromBlock = latest > windowBlocks ? latest - windowBlocks : 0n;
  const [metadataUpdateLogs, batchLogs] = await Promise.all([
    rpc.getLogs({ address, topics: [METADATA_UPDATE_TOPICS.metadataUpdate], fromBlock, toBlock: latest }),
    rpc.getLogs({ address, topics: [METADATA_UPDATE_TOPICS.batchMetadataUpdate], fromBlock, toBlock: latest }),
  ]);
  return {
    fromBlock: fromBlock.toString(),
    toBlock: latest.toString(),
    metadataUpdateCount: metadataUpdateLogs.length,
    batchMetadataUpdateCount: batchLogs.length,
    truncated: fromBlock > 0n,
  };
}

export async function assessMutability(
  rpc: NftRpc,
  address: string,
  block: bigint,
  windowBlocks: bigint = METADATA_UPDATE_LOG_WINDOW_BLOCKS,
): Promise<MutabilityResult> {
  const [owner, baseUriSetterSignals, freezeFlags, metadataUpdateScan] = await Promise.all([
    readOwner(rpc, address, block),
    probeBaseUriSetters(rpc, address, block),
    probeFreezeFlags(rpc, address, block),
    scanMetadataUpdateEvents(rpc, address, block, windowBlocks),
  ]);

  return { owner, baseUriSetterSignals, freezeFlags, metadataUpdateScan };
}
