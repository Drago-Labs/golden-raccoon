import { describe, expect, it } from "vitest";
import { ScoreCalibrationError } from "@/server/research/score-calibration/errors";
import { buildCalibrationReport } from "@/server/research/score-calibration/service";
import { noopDeps, request, snapshot } from "./fixtures";

describe("buildCalibrationReport", () => {
  it("rejects a malformed request", async () => {
    await expect(buildCalibrationReport({ outcomeType: "large_drawdown" }, noopDeps())).rejects.toBeInstanceOf(ScoreCalibrationError);
  });

  it("excludes snapshots whose horizon has not elapsed and never counts them in a bucket", async () => {
    const deps = { ...noopDeps(), readScoreSnapshots: () => [snapshot({ snapshotId: "s1", score: 10, publishedAt: "2026-01-01T00:00:00.000Z" })] };

    const report = await buildCalibrationReport(request({ evaluatedAt: "2026-01-05T00:00:00.000Z" }), deps);

    expect(report.totalSnapshotsIncluded).toBe(0);
    expect(report.excludedSnapshots).toEqual([{ snapshotId: "s1", assetKey: snapshot({ snapshotId: "s1" }).assetKey, reason: "horizon_not_elapsed", note: expect.stringContaining("horizon") }]);
    expect(report.buckets.find((b) => b.bucket.label === "0-20")?.sampleSize).toBe(0);
  });

  it("buckets an included snapshot and computes a sample-insufficient bucket for a single data point", async () => {
    const deps = {
      ...noopDeps(),
      readScoreSnapshots: () => [snapshot({ snapshotId: "s1", score: 10, publishedAt: "2026-01-01T00:00:00.000Z" })],
      detectLargeDrawdown: async () => ({ outcome: "occurred" as const }),
    };

    const report = await buildCalibrationReport(request({ evaluatedAt: "2026-02-05T00:00:00.000Z" }), deps);

    expect(report.totalSnapshotsIncluded).toBe(1);
    const bucket = report.buckets.find((b) => b.bucket.label === "0-20")!;
    expect(bucket.sampleSize).toBe(1);
    expect(bucket.outcomeCount).toBe(1);
    expect(bucket.observedRate).toBe(1);
    expect(bucket.sufficientSample).toBe(false);
  });

  it("excludes a snapshot whose outcome could not be detected, with the detector's reason", async () => {
    const deps = {
      ...noopDeps(),
      readScoreSnapshots: () => [snapshot({ snapshotId: "s1", publishedAt: "2026-01-01T00:00:00.000Z" })],
      detectLargeDrawdown: async () => ({ outcome: "unsupported" as const, reason: "price_data_unavailable" as const, issues: ["no trades"] }),
    };

    const report = await buildCalibrationReport(request({ evaluatedAt: "2026-02-05T00:00:00.000Z" }), deps);

    expect(report.totalSnapshotsIncluded).toBe(0);
    expect(report.excludedSnapshots[0]).toMatchObject({ reason: "price_data_unavailable" });
  });

  it("never mutates or re-reads from anything but the injected readScoreSnapshots dependency", async () => {
    let callCount = 0;
    const deps = { ...noopDeps(), readScoreSnapshots: () => { callCount += 1; return []; } };
    await buildCalibrationReport(request(), deps);
    expect(callCount).toBe(1);
  });

  it("guarantees scoringModelUnchanged and readOnly on every report", async () => {
    const report = await buildCalibrationReport(request(), noopDeps());
    expect(report.scoringModelUnchanged).toBe(true);
    expect(report.readOnly).toBe(true);
  });
});
