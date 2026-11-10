import { HOLDING_CORRELATION_LIMITS } from "./limits";
import { computeReturnMap, sanitizePriceSeries } from "./priceSeries";
import type { ExcludedHolding, HoldingSeries } from "./schema";

export function partitionHoldingsByHistory(
  seriesList: HoldingSeries[],
  minOverlapPoints: number = HOLDING_CORRELATION_LIMITS.minOverlapPoints,
): { included: HoldingSeries[]; exclusions: ExcludedHolding[] } {
  const included: HoldingSeries[] = [];
  const exclusions: ExcludedHolding[] = [];

  for (const item of seriesList) {
    const clean = sanitizePriceSeries(item.points);
    if (clean.length === 0) {
      exclusions.push({
        assetId: item.assetId,
        symbol: item.symbol,
        reason: "missing_price_feed",
        availablePoints: 0,
        requiredPoints: minOverlapPoints + 1,
      });
      continue;
    }
    const returns = Array.from(computeReturnMap(clean).values());
    if (returns.length < minOverlapPoints) {
      exclusions.push({
        assetId: item.assetId,
        symbol: item.symbol,
        reason: "insufficient_history",
        availablePoints: returns.length,
        requiredPoints: minOverlapPoints,
      });
      continue;
    }
    const first = returns[0]!;
    const allSame = returns.every((r) => Math.abs(r - first) <= 1e-15);
    if (allSame) {
      exclusions.push({
        assetId: item.assetId,
        symbol: item.symbol,
        reason: "zero_variance",
        availablePoints: returns.length,
        requiredPoints: minOverlapPoints,
      });
      continue;
    }
    included.push({ ...item, points: clean });
  }

  return { included, exclusions };
}
