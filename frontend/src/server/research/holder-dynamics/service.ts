import { chainKey, labelAddress, shareBps } from "./labels";
import type { HolderDynamicsResult, HolderRow, Movement, SnapshotReader } from "./schema";

const ZERO = "0x0000000000000000000000000000000000000000";

export async function analyzeHolderDynamics(
  input: { network: string; tokenAddress: string; fromBlock: number; toBlock: number },
  reader: SnapshotReader,
): Promise<HolderDynamicsResult> {
  const warnings: string[] = [];
  try {
    const [fromHash, toHash] = await Promise.all([reader.getBlockHash(input.fromBlock), reader.getBlockHash(input.toBlock)]);
    if (!fromHash || !toHash) {
      return baseUnavailable(input, ["Block hash unavailable — snapshots are not comparable"]);
    }
    if (fromHash === "reorg" || toHash === "reorg") {
      return {
        ...baseUnavailable(input, ["Inconsistent block window / reorg detected"]),
        state: "non_comparable",
      };
    }

    const decimals = await reader.getDecimals();
    const [fromHoldersRaw, toHoldersRaw, totalSupply, transfers] = await Promise.all([
      reader.getHolders(input.fromBlock),
      reader.getHolders(input.toBlock),
      reader.getTotalSupply(input.toBlock),
      reader.getTransfers(input.fromBlock, input.toBlock),
    ]);

    let state: HolderDynamicsResult["state"] = "complete";
    if (toHoldersRaw.length === 0) {
      return {
        network: input.network,
        tokenAddress: input.tokenAddress,
        decimals,
        fromBlock: input.fromBlock,
        toBlock: input.toBlock,
        state: "unavailable",
        totalSupplyRaw: totalSupply?.toString() ?? null,
        observedSupplyRaw: "0",
        coverageRatio: null,
        topHolderShareBps: null,
        top10ShareBps: null,
        holders: [],
        buckets: [],
        movements: [],
        warnings: ["Holder list missing at toBlock"],
        scoreUnchanged: true,
      };
    }

    const truncated = Boolean((toHoldersRaw as Array<{ truncated?: boolean }>).some((row) => (row as { truncated?: boolean }).truncated));
    if (truncated) {
      state = "truncated";
      warnings.push("Holder list is truncated; observed balances are not total supply coverage");
    }

    const holders: HolderRow[] = toHoldersRaw
      .map((row) => {
        const classified = labelAddress(row.address, row.code);
        return {
          key: chainKey(input.network, row.address),
          network: input.network,
          address: row.address.toLowerCase(),
          balanceRaw: row.balance.toString(),
          label: classified.label,
          labelEvidence: classified.evidence,
        };
      })
      .sort((left, right) => {
        const delta = BigInt(right.balanceRaw) - BigInt(left.balanceRaw);
        if (delta > 0n) return 1;
        if (delta < 0n) return -1;
        return left.address.localeCompare(right.address);
      });

    const observed = holders.reduce((sum, row) => sum + BigInt(row.balanceRaw), 0n);
    const coverageRatio = totalSupply != null && totalSupply > 0n ? Number(observed) / Number(totalSupply) : null;
    if (totalSupply != null && observed < totalSupply && state === "complete") {
      state = "partial";
      warnings.push("Observed holder balances are below reported total supply");
    }

    const top = holders[0] ? BigInt(holders[0].balanceRaw) : 0n;
    const top10 = holders.slice(0, 10).reduce((sum, row) => sum + BigInt(row.balanceRaw), 0n);
    const base = observed > 0n ? observed : totalSupply ?? 0n;

    const movements: Movement[] = transfers.map((transfer) => {
      const fromZero = transfer.from.toLowerCase() === ZERO;
      const toZero = transfer.to.toLowerCase() === ZERO;
      const kind = fromZero ? "mint" : toZero ? "burn" : "transfer";
      return {
        kind,
        fromKey: fromZero ? null : chainKey(input.network, transfer.from),
        toKey: toZero ? null : chainKey(input.network, transfer.to),
        amountRaw: transfer.value.toString(),
        txHash: transfer.txHash,
        blockNumber: transfer.blockNumber,
        note: `${kind} between snapshots ${input.fromBlock}→${input.toBlock}`,
      };
    });

    if (fromHoldersRaw.length === 0 && transfers.length === 0) {
      movements.push({
        kind: "indexing_gap",
        fromKey: null,
        toKey: null,
        amountRaw: "0",
        txHash: null,
        blockNumber: input.toBlock,
        note: "From-snapshot holders missing and no transfers indexed",
      });
      state = state === "complete" ? "partial" : state;
    }

    const buckets = [
      { label: "top1", holderCount: holders.length ? 1 : 0, balanceRaw: top.toString() },
      { label: "top10", holderCount: Math.min(10, holders.length), balanceRaw: top10.toString() },
      { label: "remainder", holderCount: Math.max(0, holders.length - 10), balanceRaw: (observed - top10).toString() },
    ];

    return {
      network: input.network,
      tokenAddress: input.tokenAddress.toLowerCase(),
      decimals,
      fromBlock: input.fromBlock,
      toBlock: input.toBlock,
      state,
      totalSupplyRaw: totalSupply?.toString() ?? null,
      observedSupplyRaw: observed.toString(),
      coverageRatio,
      topHolderShareBps: shareBps(top, base),
      top10ShareBps: shareBps(top10, base),
      holders,
      buckets,
      movements,
      warnings,
      scoreUnchanged: true,
    };
  } catch (error) {
    return baseUnavailable(input, [error instanceof Error ? error.message : "Provider unavailable"]);
  }
}

function baseUnavailable(input: { network: string; tokenAddress: string; fromBlock: number; toBlock: number }, warnings: string[]): HolderDynamicsResult {
  return {
    network: input.network,
    tokenAddress: input.tokenAddress.toLowerCase(),
    decimals: 18,
    fromBlock: input.fromBlock,
    toBlock: input.toBlock,
    state: "unavailable",
    totalSupplyRaw: null,
    observedSupplyRaw: "0",
    coverageRatio: null,
    topHolderShareBps: null,
    top10ShareBps: null,
    holders: [],
    buckets: [],
    movements: [],
    warnings,
    scoreUnchanged: true,
  };
}
