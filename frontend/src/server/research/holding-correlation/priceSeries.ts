import type { PricePoint } from "./schema";

/**
 * Sorts price observations by timestamp ascending, deduplicates identical
 * timestamps (keeping the latest entry), and drops non-positive prices.
 */
export function sanitizePriceSeries(points: PricePoint[]): PricePoint[] {
  const byTs = new Map<number, number>();
  for (const pt of points) {
    if (Number.isFinite(pt.timestamp) && Number.isFinite(pt.price) && pt.price > 0) {
      byTs.set(pt.timestamp, pt.price);
    }
  }
  return Array.from(byTs.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([timestamp, price]) => ({ timestamp, price }));
}

/**
 * Computes period simple returns r_t = (P_t - P_{t-1}) / P_{t-1} keyed by the
 * ending timestamp t.
 */
export function computeReturnMap(points: PricePoint[]): Map<number, number> {
  const clean = sanitizePriceSeries(points);
  const returns = new Map<number, number>();
  for (let i = 1; i < clean.length; i++) {
    const prev = clean[i - 1]!;
    const curr = clean[i]!;
    returns.set(curr.timestamp, (curr.price - prev.price) / prev.price);
  }
  return returns;
}
