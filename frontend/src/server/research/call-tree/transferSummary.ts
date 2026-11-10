import type { CallTreeNode, NetTransferEntry, TokenTransferMovement } from "./schema";

export function collectTransfersAndSummarize(roots: CallTreeNode[]): {
  transfers: TokenTransferMovement[];
  netMovements: NetTransferEntry[];
} {
  const transfers: TokenTransferMovement[] = [];

  function walk(node: CallTreeNode) {
    for (const t of node.transfers) {
      transfers.push(t);
    }
    for (const child of node.children) {
      walk(child);
    }
  }
  for (const root of roots) walk(root);

  const deltaMap = new Map<string, { address: string; tokenContractId: string; symbol: string; delta: bigint }>();

  function addDelta(address: string, tokenContractId: string, symbol: string, amount: bigint) {
    const key = `${address}::${tokenContractId}`;
    const existing = deltaMap.get(key);
    if (existing) {
      existing.delta += amount;
    } else {
      deltaMap.set(key, { address, tokenContractId, symbol, delta: amount });
    }
  }

  for (const t of transfers) {
    const amt = BigInt(t.amountRaw);
    addDelta(t.from, t.tokenContractId, t.symbol, -amt);
    addDelta(t.to, t.tokenContractId, t.symbol, amt);
  }

  const netMovements: NetTransferEntry[] = Array.from(deltaMap.values())
    .filter((entry) => entry.delta !== 0n)
    .map((entry) => ({
      address: entry.address,
      tokenContractId: entry.tokenContractId,
      symbol: entry.symbol,
      netDeltaRaw: entry.delta.toString(),
    }));

  return { transfers, netMovements };
}
