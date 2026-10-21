/** Pure assignment of included snapshots into fixed score buckets. */
import type { ScoreBucket } from "./schema";

export const SCORE_BUCKETS: ScoreBucket[] = [
  { label: "0-20", scoreRangeLow: 0, scoreRangeHigh: 20 },
  { label: "20-40", scoreRangeLow: 20, scoreRangeHigh: 40 },
  { label: "40-60", scoreRangeLow: 40, scoreRangeHigh: 60 },
  { label: "60-80", scoreRangeLow: 60, scoreRangeHigh: 80 },
  { label: "80-100", scoreRangeLow: 80, scoreRangeHigh: 100 },
];

export function bucketForScore(score: number): ScoreBucket | null {
  return SCORE_BUCKETS.find((bucket) => (bucket.scoreRangeHigh === 100 ? score >= bucket.scoreRangeLow && score <= 100 : score >= bucket.scoreRangeLow && score < bucket.scoreRangeHigh)) ?? null;
}

export type IncludedOutcome = { score: number; occurred: boolean };

export function groupByBucket(included: IncludedOutcome[]): Map<string, { bucket: ScoreBucket; sampleSize: number; outcomeCount: number }> {
  const groups = new Map<string, { bucket: ScoreBucket; sampleSize: number; outcomeCount: number }>();

  for (const bucket of SCORE_BUCKETS) {
    groups.set(bucket.label, { bucket, sampleSize: 0, outcomeCount: 0 });
  }

  for (const item of included) {
    const bucket = bucketForScore(item.score);
    if (!bucket) continue;
    const group = groups.get(bucket.label)!;
    group.sampleSize += 1;
    if (item.occurred) group.outcomeCount += 1;
  }

  return groups;
}
