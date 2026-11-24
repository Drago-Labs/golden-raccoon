import { describe, expect, it } from "vitest";
import { buildFindings } from "@/server/research/sep41-conformance/findings";
import { diffInterface } from "@/server/research/sep41-conformance/interfaceDiff";
import { validateEventShapes } from "@/server/research/sep41-conformance/eventShapes";
import { normalizeSampledEvent } from "@/server/research/sep41-conformance/eventSampler";
import { fixtures } from "./fixtures";

describe("sep41 findings", () => {
  it("surfaces missing functions and extras", () => {
    const interfaceDiff = diffInterface(fixtures.missing.functions ?? []);
    const findings = buildFindings({
      interfaceDiff,
      simulations: fixtures.missing.simulations ?? [],
      eventShapes: [],
      specAvailable: true,
    });

    expect(findings.some((finding) => finding.kind === "missing" && finding.subject === "approve")).toBe(true);
    expect(findings.some((finding) => finding.kind === "extra" && finding.subject === "custom_mint")).toBe(true);
  });

  it("includes event field mismatches from the wrong-event fixture", () => {
    const samples = (fixtures.wrongEvents.events ?? [])
      .map((event, index) =>
        normalizeSampledEvent(
          { id: event.id, ledger: event.ledger, topics: event.topics, data: event.data },
          index,
        ),
      )
      .filter((event): event is NonNullable<typeof event> => event !== null);
    const eventShapes = validateEventShapes(samples);
    const findings = buildFindings({
      interfaceDiff: [],
      simulations: [],
      eventShapes,
      specAvailable: true,
    });

    expect(findings.some((finding) => finding.kind === "event" && finding.detail.includes("field:"))).toBe(true);
  });
});
