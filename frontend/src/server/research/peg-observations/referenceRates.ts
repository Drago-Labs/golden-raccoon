import {
  type NormalizedObservation,
  type RawObservation,
  type ReferenceRate,
} from "./schema";

export type RateNormalizationResult = {
  normalizedObservations: NormalizedObservation[];
  missingRateTimestamps: number[];
  stalePointCount: number;
};

/**
 * Normalizes raw observations to the peg's target reference currency.
 * Currency conversion only occurs when a valid timestamped reference rate exists within the allowable match window.
 * Observations without matching conversion rates remain marked as unavailable rather than synthesizing artificial prices.
 */
export function normalizeObservationCurrencies(
  observations: RawObservation[],
  referenceRates: ReferenceRate[],
  targetReferenceCurrency: string,
  options?: {
    rateMatchToleranceMs?: number;
    stalenessThresholdMs?: number;
    now?: () => number;
  },
): RateNormalizationResult {
  const clock = options?.now ?? Date.now;
  const currentInstant = clock();
  const rateToleranceMs = options?.rateMatchToleranceMs ?? 900_000;
  const stalenessThresholdMs = options?.stalenessThresholdMs ?? 86_400_000;
  const targetCurrency = targetReferenceCurrency.trim().toUpperCase();

  const normalized: NormalizedObservation[] = [];
  const missingRateTimestamps: number[] = [];
  let staleCount = 0;

  for (const obs of observations) {
    const isStale = currentInstant - obs.timestamp > stalenessThresholdMs;
    if (isStale) {
      staleCount += 1;
    }

    if (obs.currency === targetCurrency) {
      normalized.push({
        timestamp: obs.timestamp,
        rawPrice: obs.price,
        rawCurrency: obs.currency,
        normalizedPrice: obs.price,
        referenceCurrency: targetCurrency,
        referenceRateUsed: 1.0,
        deviationBps: null,
        isStale,
        isRateMissing: false,
        source: obs.source,
      });
      continue;
    }

    let matchingRate: number | null = null;
    let minDelta = Number.MAX_SAFE_INTEGER;

    for (const rate of referenceRates) {
      const fromCurr = rate.fromCurrency.trim().toUpperCase();
      const toCurr = rate.toCurrency.trim().toUpperCase();
      const delta = Math.abs(rate.timestamp - obs.timestamp);

      if (delta <= rateToleranceMs && delta < minDelta) {
        if (fromCurr === obs.currency && toCurr === targetCurrency) {
          matchingRate = rate.rate;
          minDelta = delta;
        } else if (fromCurr === targetCurrency && toCurr === obs.currency && rate.rate > 0) {
          matchingRate = 1 / rate.rate;
          minDelta = delta;
        }
      }
    }

    if (matchingRate === null) {
      missingRateTimestamps.push(obs.timestamp);
      normalized.push({
        timestamp: obs.timestamp,
        rawPrice: obs.price,
        rawCurrency: obs.currency,
        normalizedPrice: null,
        referenceCurrency: targetCurrency,
        referenceRateUsed: null,
        deviationBps: null,
        isStale,
        isRateMissing: true,
        source: obs.source,
      });
    } else {
      const normalizedPrice = Number((obs.price * matchingRate).toFixed(8));
      normalized.push({
        timestamp: obs.timestamp,
        rawPrice: obs.price,
        rawCurrency: obs.currency,
        normalizedPrice,
        referenceCurrency: targetCurrency,
        referenceRateUsed: Number(matchingRate.toFixed(8)),
        deviationBps: null,
        isStale,
        isRateMissing: false,
        source: obs.source,
      });
    }
  }

  return {
    normalizedObservations: normalized,
    missingRateTimestamps,
    stalePointCount: staleCount,
  };
}
