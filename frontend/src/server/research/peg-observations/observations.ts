import { type RawObservation } from "./schema";

export type ObservationSanitizationResult = {
  observations: RawObservation[];
  duplicateTimestampsResolved: number;
  outOfOrderObservationsSorted: number;
  invalidCount: number;
};

/**
 * Validates, sorts, and deterministically resolves raw price observations.
 * Handles out-of-order entries by sorting chronologically.
 * Resolves duplicate timestamps deterministically via arithmetic mean calculation.
 */
export function ingestAndSanitizeObservations(
  raw: RawObservation[],
  options?: {
    maxFutureDriftMs?: number;
    now?: () => number;
  },
): ObservationSanitizationResult {
  const clock = options?.now ?? Date.now;
  const maxFutureDriftMs = options?.maxFutureDriftMs ?? 300_000;
  const maxAllowableTimestamp = clock() + maxFutureDriftMs;

  let invalidCount = 0;
  const valid: RawObservation[] = [];

  for (const item of raw) {
    if (
      typeof item.timestamp !== "number" ||
      !Number.isFinite(item.timestamp) ||
      item.timestamp <= 0 ||
      item.timestamp > maxAllowableTimestamp ||
      typeof item.price !== "number" ||
      !Number.isFinite(item.price) ||
      item.price <= 0 ||
      !item.currency ||
      typeof item.currency !== "string"
    ) {
      invalidCount += 1;
      continue;
    }

    valid.push({
      timestamp: Math.floor(item.timestamp),
      price: item.price,
      currency: item.currency.trim().toUpperCase(),
      source: item.source || "evidence_feed",
      volume: item.volume !== undefined && Number.isFinite(item.volume) && item.volume >= 0 ? item.volume : undefined,
    });
  }

  let outOfOrderCount = 0;
  for (let i = 1; i < valid.length; i += 1) {
    if (valid[i].timestamp < valid[i - 1].timestamp) {
      outOfOrderCount += 1;
    }
  }

  valid.sort((a, b) => {
    if (a.timestamp !== b.timestamp) {
      return a.timestamp - b.timestamp;
    }
    return a.currency.localeCompare(b.currency);
  });

  const groupedByTimestamp = new Map<number, RawObservation[]>();
  for (const obs of valid) {
    const existing = groupedByTimestamp.get(obs.timestamp);
    if (!existing) {
      groupedByTimestamp.set(obs.timestamp, [obs]);
    } else {
      existing.push(obs);
    }
  }

  let duplicateResolvedCount = 0;
  const deduplicated: RawObservation[] = [];

  groupedByTimestamp.forEach((group, timestamp) => {
    if (group.length === 1) {
      deduplicated.push(group[0]);
      return;
    }

    duplicateResolvedCount += group.length - 1;

    const sameCurrency = group.every((g) => g.currency === group[0].currency);
    const primaryCurrency = sameCurrency ? group[0].currency : group[0].currency;

    const totalPrice = group.reduce((sum, item) => sum + item.price, 0);
    const meanPrice = totalPrice / group.length;

    const totalVolume = group.reduce((sum, item) => sum + (item.volume ?? 0), 0);

    deduplicated.push({
      timestamp,
      price: Number(meanPrice.toFixed(8)),
      currency: primaryCurrency,
      source: `${group[0].source}_dedup_mean`,
      volume: totalVolume > 0 ? totalVolume : undefined,
    });
  });

  return {
    observations: deduplicated,
    duplicateTimestampsResolved: duplicateResolvedCount,
    outOfOrderObservationsSorted: outOfOrderCount,
    invalidCount,
  };
}
