/**
 * Public entry point for the score calibration report.
 *
 * Reads historical score snapshots, excludes any whose horizon has not
 * elapsed or whose outcome could not be checked, buckets what remains by
 * score, and reports each bucket's observed outcome rate with a Wilson
 * confidence interval and a sample-size flag. Never retrains or adjusts
 * the scoring model, and never writes to the snapshot history it reads.
 */
import { bucketForScore, groupByBucket } from "./bucketing";
import { summarizeCoverage } from "./coverage";
import { ScoreCalibrationError } from "./errors";
import { horizonNotElapsedExclusion, unsupportedDetectionExclusion } from "./exclusions";
import { computeHorizonWindow } from "./horizon";
import { isSampleSufficient, wilsonInterval } from "./intervals";
import type { OutcomeDetectionResult } from "./outcomeDetection";
import {
  SCORE_CALIBRATION_SCHEMA_VERSION,
  scoreCalibrationRequestSchema,
  type BucketResult,
  type CalibrationReport,
  type ExcludedSnapshot,
  type ScoreSnapshot,
} from "./schema";

export type ScoreCalibrationDeps = {
  readScoreSnapshots: (network: "testnet" | "pubnet") => ScoreSnapshot[];
  detectLargeDrawdown: (assetKey: string, network: "testnet" | "pubnet", windowStartMs: number, windowEndMs: number) => Promise<OutcomeDetectionResult>;
  detectDepeg: (assetKey: string, windowStartMs: number, windowEndMs: number) => OutcomeDetectionResult;
  detectIncident: (assetKey: string, windowStartMs: number, windowEndMs: number) => OutcomeDetectionResult;
};

export async function buildCalibrationReport(input: unknown, deps: ScoreCalibrationDeps): Promise<CalibrationReport> {
  const parsed = scoreCalibrationRequestSchema.safeParse(input);
  if (!parsed.success) {
    throw new ScoreCalibrationError("invalid_request", "The score calibration request could not be read.", parsed.error.flatten());
  }

  const { outcomeType, horizonDays, network } = parsed.data;
  const evaluatedAt = parsed.data.evaluatedAt ? new Date(Date.parse(parsed.data.evaluatedAt)).toISOString() : new Date().toISOString();

  const snapshots = deps.readScoreSnapshots(network);
  const excludedSnapshots: ExcludedSnapshot[] = [];
  const included: { score: number; occurred: boolean }[] = [];

  for (const snapshot of snapshots) {
    const horizonExclusion = horizonNotElapsedExclusion(snapshot, horizonDays, evaluatedAt);
    if (horizonExclusion) {
      excludedSnapshots.push(horizonExclusion);
      continue;
    }

    const window = computeHorizonWindow(snapshot.publishedAt, horizonDays, evaluatedAt);
    const windowStartMs = Date.parse(window.windowStart);
    const windowEndMs = Date.parse(window.windowEnd);

    const result: OutcomeDetectionResult =
      outcomeType === "large_drawdown"
        ? await deps.detectLargeDrawdown(snapshot.assetKey, network, windowStartMs, windowEndMs)
        : outcomeType === "depeg"
          ? deps.detectDepeg(snapshot.assetKey, windowStartMs, windowEndMs)
          : deps.detectIncident(snapshot.assetKey, windowStartMs, windowEndMs);

    const detectionExclusion = unsupportedDetectionExclusion(snapshot, result);
    if (detectionExclusion) {
      excludedSnapshots.push(detectionExclusion);
      continue;
    }

    if (bucketForScore(snapshot.score)) {
      included.push({ score: snapshot.score, occurred: result.outcome === "occurred" });
    }
  }

  const groups = groupByBucket(included);
  const buckets: BucketResult[] = Array.from(groups.values()).map(({ bucket, sampleSize, outcomeCount }) => ({
    bucket,
    sampleSize,
    outcomeCount,
    observedRate: sampleSize > 0 ? outcomeCount / sampleSize : null,
    confidenceInterval: wilsonInterval(outcomeCount, sampleSize),
    sufficientSample: isSampleSufficient(sampleSize),
  }));

  return {
    schemaVersion: SCORE_CALIBRATION_SCHEMA_VERSION,
    evaluatedAt,
    network,
    outcomeType,
    horizonDays,
    buckets,
    excludedSnapshots,
    totalSnapshotsRead: snapshots.length,
    totalSnapshotsIncluded: included.length,
    coverage: summarizeCoverage(snapshots.length, included.length, excludedSnapshots, buckets),
    scoringModelUnchanged: true,
    readOnly: true,
  };
}
