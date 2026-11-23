import { nearestRank } from "./percentiles";
import type { MatchedTransfer, RouteLatency } from "./schema";
export function routeLatencies(matched: MatchedTransfer[]): RouteLatency[] {
  const groups = new Map<string, number[]>();
  for (const row of matched) {
    const list = groups.get(row.route) ?? [];
    list.push(row.latencySeconds);
    groups.set(row.route, list);
  }
  return [...groups.entries()].map(([route, samples]) => {
    const sorted = [...samples].sort((a, b) => a - b);
    return { route, count: sorted.length, p50: nearestRank(sorted, 50), p95: nearestRank(sorted, 95) };
  });
}
