import { describe, expect, it } from "vitest";
import { analyseProviderDrift } from "@/server/research/provider-schema-drift/service";
import {
  additiveMarket,
  flakyProbe,
  secretRedaction,
  unchangedReplay,
  unitShiftedStellar,
  unavailableProbe,
} from "./fixtures";

describe("provider schema drift", () => {
  it("detects a structurally valid but unit-shifted response as breaking", () => {
    const report = analyseProviderDrift(unitShiftedStellar);
    expect(report.findings.some((finding) => finding.classification === "breaking" && finding.path === "balance.unit")).toBe(
      true,
    );
    expect(report.summary.breaking).toBeGreaterThan(0);
  });

  it("classifies new fields as additive", () => {
    const report = analyseProviderDrift(additiveMarket);
    expect(report.findings.some((finding) => finding.classification === "additive")).toBe(true);
  });

  it("treats a failed probe as unavailable, not a pass", () => {
    const report = analyseProviderDrift(unavailableProbe);
    expect(report.findings.every((finding) => finding.classification === "unavailable")).toBe(true);
    expect(report.summary.unchanged).toBe(0);
  });

  it("marks flaky providers inconclusive", () => {
    const report = analyseProviderDrift(flakyProbe);
    expect(report.findings.some((finding) => finding.classification === "inconclusive")).toBe(true);
  });

  it("redacts credentials and wallet identifiers from artifacts", () => {
    const report = analyseProviderDrift(secretRedaction);
    const encoded = JSON.stringify(report.artifacts);
    expect(encoded).not.toContain("sk-live-should-never-appear");
    expect(encoded).not.toContain("secret-material");
    expect(encoded).toContain("[redacted-wallet]");
    expect(report.artifacts[0]?.droppedKeys.length).toBeGreaterThan(0);
  });

  it("replays deterministically for an unchanged fixture", () => {
    const first = analyseProviderDrift(unchangedReplay);
    const second = analyseProviderDrift(unchangedReplay);
    expect(first).toEqual(second);
    expect(first.findings.some((finding) => finding.classification === "unchanged")).toBe(true);
  });
});
