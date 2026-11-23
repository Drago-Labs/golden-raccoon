import { describe, expect, it } from "vitest";
import { diffSnapshots } from "@/server/research/frontend-integrity/snapshotDiff";
import { createSnapshotStore } from "@/server/research/frontend-integrity/snapshotStore";
import { analyseFrontendIntegrity } from "@/server/research/frontend-integrity/service";
import { loadFixture } from "./fixtures";

describe("consecutive snapshots diff by script hash", () => {
  it("reports the removed first-party script and the two new scripts", () => {
    const result = analyseFrontendIntegrity(loadFixture("changed-scripts.json"));
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(result.report.diff.removed).toHaveLength(1);
    expect(result.report.diff.added).toHaveLength(2);
    const store = createSnapshotStore();
    store.save(result.report.current);
    expect(store.previous("app.example")?.id).toBe(result.report.current.id);
    expect(diffSnapshots(result.report.previous, result.report.current).added).toHaveLength(2);
  });
});
