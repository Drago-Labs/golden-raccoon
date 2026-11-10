import { VOLATILITY_PROFILE_LIMITS } from "./limits";
import type { DetectedGap, PriceObservation } from "./schema";
import { normalizeObservations } from "./series";

export function detectSeriesGaps(
  observations: PriceObservation[],
  expectedStepSeconds: number,
): DetectedGap[] {
  const sorted = normalizeObservations(observations);
  const gaps: DetectedGap[] = [];
  const threshold = expectedStepSeconds * VOLATILITY_PROFILE_LIMITS.gapMultiplierThreshold;

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    const curr = sorted[i]!;
    const elapsed = curr.timestamp - prev.timestamp;
    if (elapsed > threshold) {
      gaps.push({
        fromTimestamp: prev.timestamp,
        toTimestamp: curr.timestamp,
        elapsedSeconds: elapsed,
        expectedSeconds: expectedStepSeconds,
      });
    }
  }
  return gaps;
}
