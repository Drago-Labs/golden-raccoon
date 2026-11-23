import { describe, expect, it } from "vitest";
import { buildCoverage } from "@/server/research/frontend-integrity/coverage";
import { findOriginIssues } from "@/server/research/frontend-integrity/originFindings";
import { analyseFrontendIntegrity } from "@/server/research/frontend-integrity/service";
import { loadFixture } from "./fixtures";

describe("new third-party origins and missing integrity attributes are flagged", () => {
  it("flags the cdn script that has no integrity attribute", () => {
    const result = analyseFrontendIntegrity(loadFixture("weak-headers.json"));
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(result.report.findings.map((finding) => finding.kind).sort()).toEqual(["missing_integrity", "new_third_party"]);
    expect(findOriginIssues(result.report.current.scripts, "https://app.example", new Set()).length).toBe(2);
    expect(buildCoverage([]).notes[0]).toMatch(/never executed|not executed|not downloaded/i);
  });
});
