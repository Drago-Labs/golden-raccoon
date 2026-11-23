import type { BalancePoint, Checkpoint } from "./schema";
/** Checkpoints are the reconstructed balances. They are sorted by time and never interpolated. */
export function rebuildBalances(checkpoints: Checkpoint[]): BalancePoint[] {
  return [...checkpoints].sort((a, b) => a.time - b.time || a.asset.localeCompare(b.asset));
}
export function latestBalance(points: BalancePoint[], asset: string, chain: string): string | null {
  const matches = points.filter((point) => point.asset === asset && point.chain === chain);
  return matches.length === 0 ? null : matches[matches.length - 1].amount;
}
