/**
 * Normalizes a raw observation series.
 *
 * Order and duplicates are handled deterministically and documented: the series
 * is sorted by timestamp, and when two observations share a timestamp the one
 * appearing later in the input wins, with the collision counted so the caller
 * can see it happened.
 */
import { deviationBps, formatDecimal, parseDecimal } from "./deviations";
import type { RateIndex } from "./referenceRates";
import type { ObservationInput, ObservationPoint, PegDefinition } from "./schema";

export type NormalizedSeries = {
  points: ObservationPoint[];
  duplicateTimestampCount: number;
  /** Observations whose timestamp could not be read at all. */
  unreadableCount: number;
};

export function normalizeObservations(
  observations: ObservationInput[],
  definition: PegDefinition,
  rates: RateIndex,
  options: { windowStartMs: number; windowEndMs: number; staleAfterSeconds: number },
): NormalizedSeries {
  const byTimestamp = new Map<number, ObservationInput>();
  let duplicateTimestampCount = 0;
  let unreadableCount = 0;

  for (const observation of observations) {
    const atMs = Date.parse(observation.observedAt);

    if (!Number.isFinite(atMs)) {
      unreadableCount += 1;
      continue;
    }

    if (atMs < options.windowStartMs || atMs > options.windowEndMs) continue;

    // Documented rule: last write wins for a duplicate timestamp. Averaging
    // would invent a price that no source reported.
    if (byTimestamp.has(atMs)) duplicateTimestampCount += 1;
    byTimestamp.set(atMs, observation);
  }

  const target = parseDecimal(definition.targetValue);

  const points = [...byTimestamp.entries()]
    .sort(([left], [right]) => left - right)
    .map(([atMs, observation]) => {
      const rawPrice = parseDecimal(observation.price);
      const converted = rates.convert(rawPrice, observation.currency, definition.referenceCurrency, atMs);
      const stale = options.windowEndMs - atMs > options.staleAfterSeconds * 1_000;

      if (converted.value === null) {
        return {
          observedAt: new Date(atMs).toISOString(),
          rawPrice: observation.price,
          rawCurrency: observation.currency.trim().toUpperCase(),
          referencePrice: null,
          deviationBps: null,
          unavailableReason: converted.reason,
          sourceLabel: observation.sourceLabel,
          stale,
        } satisfies ObservationPoint;
      }

      return {
        observedAt: new Date(atMs).toISOString(),
        rawPrice: observation.price,
        rawCurrency: observation.currency.trim().toUpperCase(),
        referencePrice: formatDecimal(converted.value),
        deviationBps: deviationBps(converted.value, target),
        unavailableReason: null,
        sourceLabel: observation.sourceLabel,
        stale,
      } satisfies ObservationPoint;
    });

  return { points, duplicateTimestampCount, unreadableCount };
}
