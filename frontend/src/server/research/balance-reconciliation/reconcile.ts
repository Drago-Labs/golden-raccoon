import type { AssetReconciliation } from "./schema";

export function reconcileAssets(
  reconstructed: Map<string, bigint>,
  recorded: Map<string, bigint> | null,
  opening: Map<string, bigint>,
): AssetReconciliation[] {
  const assets = [...new Set([...reconstructed.keys(), ...(recorded?.keys() ?? []), ...opening.keys()])].sort();
  return assets.map((asset) => {
    const reconstructedStroops = reconstructed.get(asset) ?? 0n;
    const recordedStroops = recorded ? (recorded.get(asset) ?? 0n) : null;
    return {
      asset,
      openingStroops: (opening.get(asset) ?? 0n).toString(),
      reconstructedStroops: reconstructedStroops.toString(),
      recordedStroops: recordedStroops?.toString() ?? null,
      deltaStroops: recordedStroops === null ? null : (recordedStroops - reconstructedStroops).toString(),
    };
  });
}

/** A truncated window, or a missing end balance, is never called a match. */
export function claimMatch(rows: AssetReconciliation[], truncated: boolean, unclassifiedCount: number): boolean {
  if (truncated || unclassifiedCount > 0) return false;
  return rows.length > 0 && rows.every((row) => row.deltaStroops === "0");
}
