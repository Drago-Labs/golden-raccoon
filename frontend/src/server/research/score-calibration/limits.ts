/** Pagination, timeout, and sample-size bounds for the score calibration report. */
export const SCORE_CALIBRATION_LIMITS = {
  maxRequestBytes: 4_096,
  fetchTimeoutMs: 8_000,
  /** Reading more snapshots than this from the history index would make one report very slow; bounded, newest-first. */
  maxSnapshotsConsidered: 2_000,
  /** Below this many included snapshots, a bucket's rate is shown but flagged as not statistically precise. */
  minBucketSampleSize: 10,
  /** Max price-aggregation points read per outcome check. */
  maxPriceAggregationPoints: 200,
} as const;
