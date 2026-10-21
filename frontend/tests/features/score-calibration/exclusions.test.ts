import { describe, expect, it } from "vitest";
import { horizonNotElapsedExclusion, unsupportedDetectionExclusion } from "@/server/research/score-calibration/exclusions";
import { snapshot } from "./fixtures";

describe("horizonNotElapsedExclusion", () => {
  it("excludes a snapshot whose horizon has not elapsed", () => {
    const result = horizonNotElapsedExclusion(snapshot({ snapshotId: "s1", publishedAt: "2026-01-01T00:00:00.000Z" }), 30, "2026-01-10T00:00:00.000Z");
    expect(result).toMatchObject({ snapshotId: "s1", reason: "horizon_not_elapsed" });
  });

  it("does not exclude a snapshot whose horizon has elapsed", () => {
    const result = horizonNotElapsedExclusion(snapshot({ snapshotId: "s1", publishedAt: "2026-01-01T00:00:00.000Z" }), 30, "2026-02-05T00:00:00.000Z");
    expect(result).toBeNull();
  });

  it("treats the exact horizon boundary as elapsed", () => {
    const result = horizonNotElapsedExclusion(snapshot({ snapshotId: "s1", publishedAt: "2026-01-01T00:00:00.000Z" }), 7, "2026-01-08T00:00:00.000Z");
    expect(result).toBeNull();
  });
});

describe("unsupportedDetectionExclusion", () => {
  it("converts an unsupported detection result into an exclusion", () => {
    const result = unsupportedDetectionExclusion(snapshot({ snapshotId: "s1" }), { outcome: "unsupported", reason: "price_data_unavailable", issues: ["no trades"] });
    expect(result).toMatchObject({ snapshotId: "s1", reason: "price_data_unavailable", note: "no trades" });
  });

  it("returns null for an occurred/did_not_occur result", () => {
    expect(unsupportedDetectionExclusion(snapshot({ snapshotId: "s1" }), { outcome: "occurred" })).toBeNull();
    expect(unsupportedDetectionExclusion(snapshot({ snapshotId: "s1" }), { outcome: "did_not_occur" })).toBeNull();
  });
});
