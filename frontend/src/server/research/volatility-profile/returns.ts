import { VOLATILITY_PROFILE_LIMITS } from "./limits";
import type { LogReturnStep, PriceObservation } from "./schema";
import { normalizeObservations } from "./series";

/**
 * Computes log returns ln(P_t / P_{t-1}) across consecutive observations,
 * excluding steps that span a detected gap rather than interpolating.
 */
export function computeLogReturns(
  observations: PriceObservation[],
  expectedStepSeconds: number,
): LogReturnStep[] {
  const sorted = normalizeObservations(observations);
  const maxStep = expectedStepSeconds * VOLATILITY_PROFILE_LIMITS.gapMultiplierThreshold;
  const steps: LogReturnStep[] = [];

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    const curr = sorted[i]!;
    if (curr.timestamp - prev.timestamp > maxStep) {
      continue;
    }
    const lr = Math.log(curr.price / prev.price);
    steps.push({
      fromTimestamp: prev.timestamp,
      toTimestamp: curr.timestamp,
      logReturn: Number(lr.toFixed(8)),
      outlier: Math.abs(lr) >= VOLATILITY_PROFILE_LIMITS.outlierLogReturnThreshold,
    });
  }
  return steps;
}
