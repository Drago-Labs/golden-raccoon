import { describe, expect, it } from "vitest";
import { inspectSep41Conformance } from "@/server/research/sep41-conformance/service";
import { Sep41ConformanceError } from "@/server/research/sep41-conformance/errors";
import { depsFromFixture, fixtures, request } from "./fixtures";

describe("inspectSep41Conformance", () => {
  it("returns a complete report for the conforming fixture", async () => {
    const report = await inspectSep41Conformance(request, depsFromFixture(fixtures.conforming));
    expect(report.referenceVersion).toBe("SEP-41/2024-11");
    expect(report.readOnly).toBe(true);
    expect(report.writesState).toBe(false);
    expect(report.interfaceDiff.every((entry) => entry.kind === "match")).toBe(true);
    expect(report.simulations.every((entry) => entry.authorizationRequired === false)).toBe(true);
    expect(report.findings).toEqual([]);
    expect(report.state).toBe("complete");
  });

  it("marks missing functions as partial and lists them in findings", async () => {
    const report = await inspectSep41Conformance(request, depsFromFixture(fixtures.missing));
    expect(report.state).toBe("partial");
    expect(report.coverage.interfaceMissing).toBeGreaterThan(0);
    expect(report.findings.some((finding) => finding.kind === "missing")).toBe(true);
    expect(report.findings.some((finding) => finding.kind === "extra")).toBe(true);
  });

  it("names mismatched event fields from the wrong-event fixture", async () => {
    const report = await inspectSep41Conformance(request, depsFromFixture(fixtures.wrongEvents));
    expect(report.state).toBe("partial");
    expect(report.eventShapes.some((shape) => shape.mismatchedField === "topic[2]")).toBe(true);
    expect(report.eventShapes.some((shape) => shape.mismatchedField === "data.live_until_ledger")).toBe(true);
  });

  it("returns unavailable when the provider throws", async () => {
    const report = await inspectSep41Conformance(request, depsFromFixture(fixtures.unavailable));
    expect(report.state).toBe("unavailable");
    expect(report.coverage.reachedProvider).toBe(false);
  });

  it("rejects invalid contract ids before touching deps", async () => {
    await expect(inspectSep41Conformance({ contractId: "not-a-contract" })).rejects.toBeInstanceOf(
      Sep41ConformanceError,
    );
  });
});
