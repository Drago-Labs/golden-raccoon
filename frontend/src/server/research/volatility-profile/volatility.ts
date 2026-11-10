import { VOLATILITY_PROFILE_LIMITS } from "./limits";
import type { LogReturnStep, SeriesInterval, VolatilityMetrics } from "./schema";

export function computeVolatilityMetrics(
  steps: LogReturnStep[],
  interval: SeriesInterval,
): VolatilityMetrics {
  const periodsPerYear = VOLATILITY_PROFILE_LIMITS.annualizationPeriodsPerYear[interval];
  const n = steps.length;
  if (n < 2) {
    return {
      sampleSize: n,
      periodVolatility: null,
      annualisedVolatility: null,
      annualisationFactor: periodsPerYear,
    };
  }
  const mean = steps.reduce((acc, s) => acc + s.logReturn, 0) / n;
  const variance = steps.reduce((acc, s) => acc + (s.logReturn - mean) ** 2, 0) / (n - 1);
  const periodVol = Math.sqrt(variance);
  const annualVol = periodVol * Math.sqrt(periodsPerYear);

  return {
    sampleSize: n,
    periodVolatility: Number(periodVol.toFixed(6)),
    annualisedVolatility: Number(annualVol.toFixed(6)),
    annualisationFactor: periodsPerYear,
  };
}
