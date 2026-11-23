/** Nearest-rank percentile. The rank is ceil(p/100*n)-1 on the ascending list. */
export function nearestRank(sorted: number[], percentile: number): number {
  if (sorted.length === 0) throw new Error("no samples");
  const rank = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank))];
}
