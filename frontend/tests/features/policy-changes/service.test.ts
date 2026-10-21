import { describe, expect, it } from "vitest";
import { PolicyChangeError } from "@/server/research/policy-changes/errors";
import { trackPolicyChanges } from "@/server/research/policy-changes/service";
import {
  FEE_CHANGED_PAGE_HTML,
  ORIGINAL_PAGE_HTML,
  createPageFetcher,
  priorSnapshotFromHtml,
  request,
} from "./fixtures";

describe("trackPolicyChanges", () => {
  it("fetches and reports a first snapshot with complete coverage", async () => {
    const report = await trackPolicyChanges(request(), { fetchPage: createPageFetcher({ html: ORIGINAL_PAGE_HTML }) });
    expect(report.coverage.state).toBe("complete");
    expect(report.timeline).toHaveLength(1);
    expect(report.currentSnapshot.contentHash).not.toBe("unavailable");
  });

  it("creates no new version when content is unchanged", async () => {
    const prior = priorSnapshotFromHtml(ORIGINAL_PAGE_HTML, "2026-01-01T00:00:00.000Z");
    const report = await trackPolicyChanges(
      request({ priorSnapshots: [prior] }),
      { fetchPage: createPageFetcher({ html: ORIGINAL_PAGE_HTML }) },
    );
    expect(report.timeline).toHaveLength(1);
    expect(report.currentSnapshot.snapshotId).toBe(prior.snapshotId);
  });

  it("produces a diff and highlighted figure change when the fee changes", async () => {
    const prior = priorSnapshotFromHtml(ORIGINAL_PAGE_HTML, "2026-01-01T00:00:00.000Z");
    const report = await trackPolicyChanges(
      request({ priorSnapshots: [prior] }),
      { fetchPage: createPageFetcher({ html: FEE_CHANGED_PAGE_HTML }) },
    );
    expect(report.timeline).toHaveLength(2);
    expect(report.diffs).toHaveLength(1);
    expect(report.diffs[0].contentUnchanged).toBe(false);
    expect(report.figureChanges.length).toBeGreaterThan(0);
  });

  it("records a fetch failure as a gap, not a removal, and keeps prior history", async () => {
    const prior = priorSnapshotFromHtml(ORIGINAL_PAGE_HTML, "2026-01-01T00:00:00.000Z");
    const report = await trackPolicyChanges(
      request({ priorSnapshots: [prior] }),
      { fetchPage: createPageFetcher({ fail: "http_error" }) },
    );
    expect(report.timeline).toHaveLength(1);
    expect(report.timeline[0].snapshotId).toBe(prior.snapshotId);
    expect(report.currentSnapshot.contentHash).toBe("unavailable");
    expect(report.coverage.state).toBe("partial");
  });

  it("reports unavailable coverage for a fetch failure with no prior history", async () => {
    const report = await trackPolicyChanges(request(), { fetchPage: createPageFetcher({ fail: "timeout" }) });
    expect(report.timeline).toHaveLength(0);
    expect(report.coverage.state).toBe("unavailable");
  });

  it("rejects an unknown project id", async () => {
    await expect(
      trackPolicyChanges(request({ projectId: "not-a-real-project" }), { fetchPage: createPageFetcher() }),
    ).rejects.toBeInstanceOf(PolicyChangeError);
  });

  it("never modifies other features or shared scoring — the feature is fully isolated", async () => {
    const report = await trackPolicyChanges(request(), { fetchPage: createPageFetcher() });
    expect(report.legalOpinion).toBeNull();
    expect(report.changeIsObservationNotJudgment).toBe(true);
    expect(report.readOnly).toBe(true);
  });
});
