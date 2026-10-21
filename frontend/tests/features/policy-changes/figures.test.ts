import { describe, expect, it } from "vitest";
import { detectFigureChanges } from "@/server/research/policy-changes/figureChanges";
import type { SnapshotDiffRow } from "@/server/research/policy-changes/schema";

describe("detectFigureChanges", () => {
  it("detects a changed percentage in a sentence-level row", () => {
    const rows: SnapshotDiffRow[] = [
      {
        unit: "sentence",
        index: 0,
        previousText: "Withdrawal fees are 2% of the transaction amount.",
        currentText: "Withdrawal fees are 5% of the transaction amount.",
        changed: true,
      },
    ];
    const changes = detectFigureChanges(rows);
    expect(changes).toHaveLength(1);
    expect(changes[0].previousValue).toBe("2%");
    expect(changes[0].currentValue).toBe("5%");
  });

  it("ignores paragraph-level rows (only sentence rows carry figures)", () => {
    const rows: SnapshotDiffRow[] = [
      { unit: "paragraph", index: 0, previousText: "Fees are 2%.", currentText: "Fees are 5%.", changed: true },
    ];
    expect(detectFigureChanges(rows)).toHaveLength(0);
  });

  it("ignores an unchanged sentence row", () => {
    const rows: SnapshotDiffRow[] = [
      { unit: "sentence", index: 0, previousText: "Fees are 2%.", currentText: "Fees are 2%.", changed: false },
    ];
    expect(detectFigureChanges(rows)).toHaveLength(0);
  });

  it("ignores a changed sentence with no figures at all", () => {
    const rows: SnapshotDiffRow[] = [
      { unit: "sentence", index: 0, previousText: "We may update this policy.", currentText: "We will update this policy.", changed: true },
    ];
    expect(detectFigureChanges(rows)).toHaveLength(0);
  });
});
