import type { CoverageGap, PricePoint, ReserveSnapshot } from "./schema";

export function detectCoverageGaps(
  reserves: ReserveSnapshot[],
  prices: PricePoint[],
  windowStart: number,
  windowEnd: number,
): CoverageGap[] {
  const gaps: CoverageGap[] = [];

  // Check for missing reserves in the window
  if (reserves.length === 0) {
    gaps.push({
      fromLedger: windowStart,
      toLedger: windowEnd,
      reason: "missing_reserves",
    });
    return gaps;
  }

  // Check for missing prices in the window
  if (prices.length === 0) {
    gaps.push({
      fromLedger: windowStart,
      toLedger: windowEnd,
      reason: "missing_prices",
    });
    return gaps;
  }

  // Check for gaps between snapshots
  for (let i = 0; i < reserves.length - 1; i++) {
    const current = reserves[i];
    const next = reserves[i + 1];
    const gap = next.ledger - current.ledger;
    
    if (gap > 1000) {
      // Report significant gaps
      gaps.push({
        fromLedger: current.ledger,
        toLedger: next.ledger,
        reason: "missing_reserves",
      });
    }
  }

  return gaps;
}
