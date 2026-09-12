/**
 * Fixed-width activity buckets and burst detection.
 *
 * Bursts are measured against the **median** bucket, not the mean, so a single
 * enormous bucket cannot raise the baseline it is being compared against and
 * hide itself.
 *
 * Observations with no timestamp are never placed in a bucket. They are counted
 * separately, because guessing a time would create synchronization that the
 * data does not show.
 */
import { COORDINATION_THRESHOLDS, type ActivityBucket, type ObservationRef } from "./schema";

function median(values: number[]): number | null {
  if (values.length === 0) return null;

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

export type BucketResult = {
  buckets: ActivityBucket[];
  missingTimestampCount: number;
  medianCount: number | null;
};

export function bucketObservations(observations: ObservationRef[], bucketSeconds: number): BucketResult {
  const bucketMs = bucketSeconds * 1_000;
  const byBucket = new Map<number, ObservationRef[]>();
  let missingTimestampCount = 0;

  for (const observation of observations) {
    const postedMs = observation.postedAt ? Date.parse(observation.postedAt) : Number.NaN;

    if (!Number.isFinite(postedMs)) {
      missingTimestampCount += 1;
      continue;
    }

    const start = Math.floor(postedMs / bucketMs) * bucketMs;
    const bucket = byBucket.get(start);
    if (bucket) bucket.push(observation);
    else byBucket.set(start, [observation]);
  }

  const counts = [...byBucket.values()].map((entries) => entries.length);
  const medianCount = median(counts);

  const buckets = [...byBucket.entries()]
    .sort(([left], [right]) => left - right)
    .map(([start, entries]) => {
      const multipleOfMedian =
        medianCount === null || medianCount === 0 ? null : Number((entries.length / medianCount).toFixed(4));

      return {
        startsAt: new Date(start).toISOString(),
        observationCount: entries.length,
        distinctAuthorCount: new Set(entries.map((entry) => entry.authorKey)).size,
        multipleOfMedian,
        isBurst:
          multipleOfMedian !== null &&
          multipleOfMedian >= COORDINATION_THRESHOLDS.burstMultiple &&
          entries.length >= COORDINATION_THRESHOLDS.minClusterSize,
      };
    });

  return { buckets, missingTimestampCount, medianCount };
}
