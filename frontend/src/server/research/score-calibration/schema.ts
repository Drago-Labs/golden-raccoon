/**
 * Versioned contract for the score calibration report.
 *
 * The line this feature refuses to cross: this tool reports how often a
 * documented, observable outcome followed scores in each bucket — with
 * sample sizes and confidence intervals that say when a rate is too thin
 * to trust — and never retrains, adjusts, or comments on whether the
 * current scoring model is good. `scoringModelUnchanged` is hard-coded to
 * `true`, and no code path here writes to the risk-publication history or
 * any score.
 */
import { z } from "zod";

export const SCORE_CALIBRATION_SCHEMA_VERSION = "score-calibration/2026-01" as const;

export type OutcomeType = "large_drawdown" | "depeg" | "incident_report";

export type HorizonDays = 7 | 30 | 90;

export const HORIZON_DAYS_OPTIONS: HorizonDays[] = [7, 30, 90];

export type SnapshotExclusionReason = "horizon_not_elapsed" | "unsupported_asset_type" | "outcome_not_configured" | "price_data_unavailable";

export type ExcludedSnapshot = {
  snapshotId: string;
  assetKey: string;
  reason: SnapshotExclusionReason;
  note: string;
};

export type ScoreBucket = {
  label: string;
  scoreRangeLow: number;
  scoreRangeHigh: number;
};

export type ConfidenceInterval = { low: number; high: number };

export type BucketResult = {
  bucket: ScoreBucket;
  sampleSize: number;
  outcomeCount: number;
  observedRate: number | null;
  confidenceInterval: ConfidenceInterval | null;
  /** `false` below the minimum sample size — the rate is shown, never hidden, but flagged as not precise. */
  sufficientSample: boolean;
};

export type CoverageState = "complete" | "partial" | "empty" | "unavailable";

export type CalibrationReport = {
  schemaVersion: typeof SCORE_CALIBRATION_SCHEMA_VERSION;
  evaluatedAt: string;
  network: "testnet" | "pubnet";
  outcomeType: OutcomeType;
  horizonDays: HorizonDays;
  buckets: BucketResult[];
  excludedSnapshots: ExcludedSnapshot[];
  totalSnapshotsRead: number;
  totalSnapshotsIncluded: number;
  coverage: { state: CoverageState; note: string };
  /** Hard-coded — this report never retrains or adjusts the scoring model. */
  scoringModelUnchanged: true;
  readOnly: true;
};

export const scoreCalibrationRequestSchema = z.object({
  outcomeType: z.enum(["large_drawdown", "depeg", "incident_report"]),
  horizonDays: z.union([z.literal(7), z.literal(30), z.literal(90)]),
  network: z.enum(["testnet", "pubnet"]).default("pubnet"),
  evaluatedAt: z.string().datetime().optional(),
});

export type ScoreCalibrationRequest = z.infer<typeof scoreCalibrationRequestSchema>;

export type ScoreSnapshot = {
  snapshotId: string;
  assetKey: string;
  assetLabel: string;
  score: number;
  publishedAt: string;
};
