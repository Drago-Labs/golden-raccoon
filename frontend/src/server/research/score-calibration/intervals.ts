/**
 * Wilson score confidence intervals for an observed outcome rate.
 *
 * Preferred over the simpler normal-approximation interval because it
 * stays within [0, 1] and is far less overconfident at the small sample
 * sizes a single score bucket will often have.
 */
import { SCORE_CALIBRATION_LIMITS } from "./limits";
import type { ConfidenceInterval } from "./schema";

const Z_95 = 1.959963984540054;

export function wilsonInterval(successes: number, sampleSize: number): ConfidenceInterval | null {
  if (sampleSize === 0) return null;

  const p = successes / sampleSize;
  const z2 = Z_95 * Z_95;
  const denominator = 1 + z2 / sampleSize;
  const center = p + z2 / (2 * sampleSize);
  const margin = Z_95 * Math.sqrt((p * (1 - p)) / sampleSize + z2 / (4 * sampleSize * sampleSize));

  return {
    low: Math.max(0, (center - margin) / denominator),
    high: Math.min(1, (center + margin) / denominator),
  };
}

export function isSampleSufficient(sampleSize: number): boolean {
  return sampleSize >= SCORE_CALIBRATION_LIMITS.minBucketSampleSize;
}
