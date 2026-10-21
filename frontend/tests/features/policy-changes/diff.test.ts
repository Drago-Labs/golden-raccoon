import { describe, expect, it } from "vitest";
import { diffSnapshots, sortTimeline } from "@/server/research/policy-changes/diff";
import { extractReadableText } from "@/server/research/policy-changes/textExtraction";
import { FEE_CHANGED_PAGE_HTML, ORIGINAL_PAGE_HTML, priorSnapshotFromHtml } from "./fixtures";

describe("diffSnapshots", () => {
  it("reports contentUnchanged for identical content hashes", () => {
    const from = priorSnapshotFromHtml(ORIGINAL_PAGE_HTML, "2026-01-01T00:00:00.000Z");
    const to = priorSnapshotFromHtml(ORIGINAL_PAGE_HTML, "2026-02-01T00:00:00.000Z");
    const diff = diffSnapshots(from, to, extractReadableText(ORIGINAL_PAGE_HTML, "text/html"), extractReadableText(ORIGINAL_PAGE_HTML, "text/html"));
    expect(diff.contentUnchanged).toBe(true);
    expect(diff.rows).toHaveLength(0);
  });

  it("produces paragraph and sentence rows for a changed fee", () => {
    const from = priorSnapshotFromHtml(ORIGINAL_PAGE_HTML, "2026-01-01T00:00:00.000Z");
    const to = priorSnapshotFromHtml(FEE_CHANGED_PAGE_HTML, "2026-02-01T00:00:00.000Z");
    const diff = diffSnapshots(
      from,
      to,
      extractReadableText(ORIGINAL_PAGE_HTML, "text/html"),
      extractReadableText(FEE_CHANGED_PAGE_HTML, "text/html"),
    );

    expect(diff.contentUnchanged).toBe(false);
    const paragraphRow = diff.rows.find((row) => row.unit === "paragraph" && row.changed);
    expect(paragraphRow?.previousText).toContain("2%");
    expect(paragraphRow?.currentText).toContain("5%");

    const sentenceRow = diff.rows.find((row) => row.unit === "sentence");
    expect(sentenceRow).toBeDefined();
  });

  it("does not flag an unrelated paragraph as changed", () => {
    const from = priorSnapshotFromHtml(ORIGINAL_PAGE_HTML, "2026-01-01T00:00:00.000Z");
    const to = priorSnapshotFromHtml(FEE_CHANGED_PAGE_HTML, "2026-02-01T00:00:00.000Z");
    const diff = diffSnapshots(
      from,
      to,
      extractReadableText(ORIGINAL_PAGE_HTML, "text/html"),
      extractReadableText(FEE_CHANGED_PAGE_HTML, "text/html"),
    );

    const noticeRow = diff.rows.find((row) => row.unit === "paragraph" && row.previousText?.includes("without notice"));
    expect(noticeRow?.changed).toBe(false);
  });
});

describe("sortTimeline", () => {
  it("sorts snapshots oldest to newest", () => {
    const newer = priorSnapshotFromHtml(ORIGINAL_PAGE_HTML, "2026-02-01T00:00:00.000Z");
    const older = priorSnapshotFromHtml(FEE_CHANGED_PAGE_HTML, "2026-01-01T00:00:00.000Z");
    const sorted = sortTimeline([newer, older]);
    expect(sorted[0].fetchedAt).toBe(older.fetchedAt);
    expect(sorted[1].fetchedAt).toBe(newer.fetchedAt);
  });
});
