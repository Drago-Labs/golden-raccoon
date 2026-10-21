/**
 * Decides which snapshots are excluded from calibration, and why.
 *
 * A snapshot whose horizon has not elapsed is excluded before any
 * outcome check runs — there is nothing to observe yet, not a "no" — and
 * an outcome check that came back `"unsupported"` is turned into the
 * matching exclusion reason here rather than silently counted as
 * `did_not_occur`.
 */
import { computeHorizonWindow } from "./horizon";
import type { OutcomeDetectionResult } from "./outcomeDetection";
import type { ExcludedSnapshot, HorizonDays, ScoreSnapshot } from "./schema";

export function horizonNotElapsedExclusion(snapshot: ScoreSnapshot, horizonDays: HorizonDays, evaluatedAt: string): ExcludedSnapshot | null {
  const window = computeHorizonWindow(snapshot.publishedAt, horizonDays, evaluatedAt);
  if (window.hasElapsed) return null;

  return {
    snapshotId: snapshot.snapshotId,
    assetKey: snapshot.assetKey,
    reason: "horizon_not_elapsed",
    note: `This snapshot's ${horizonDays}-day horizon ends ${window.windowEnd}, which has not passed yet.`,
  };
}

export function unsupportedDetectionExclusion(snapshot: ScoreSnapshot, result: OutcomeDetectionResult): ExcludedSnapshot | null {
  if (result.outcome !== "unsupported") return null;

  return {
    snapshotId: snapshot.snapshotId,
    assetKey: snapshot.assetKey,
    reason: result.reason,
    note: result.issues[0] ?? "This outcome could not be checked for this snapshot.",
  };
}
