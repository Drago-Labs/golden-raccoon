import { describe, expect, it } from "vitest";
import { canonicalAssetIdentity } from "@/server/research/risk-explanations/reportAdapter";
import { explainReport } from "@/server/research/risk-explanations/service";
import { ExplanationValidationError } from "@/server/research/risk-explanations/schema";
import {
  additiveReport,
  clone,
  completeAndUnlinkedReport,
  duplicateLabelReport,
  emptyReport,
  nonAdditiveAndConflictingReport,
  sameSymbolTestnetReport,
} from "./fixtures";

function explain(report: unknown) {
  return explainReport({ reportVersion: "risk-report/v1", report });
}

describe("contribution resolution", () => {
  it("resolves every contribution to its original factor and source", () => {
    const { explanation } = explain(completeAndUnlinkedReport);

    const minted = explanation.contributions.find((entry) => entry.label === "Owner can mint");
    expect(minted).toBeDefined();
    expect(minted?.agent).toBe("onchain");
    expect(minted?.evidence.state).toBe("resolved");
    expect(minted?.evidence.source?.label).toBe("GoPlus");
    expect(minted?.impact).toBe(72);
  });

  it("keeps duplicate labels from different agents distinct", () => {
    const { explanation } = explain(duplicateLabelReport);

    const liquidityRows = explanation.contributions.filter((entry) => entry.label === "Liquidity depth");
    expect(liquidityRows).toHaveLength(2);
    expect(new Set(liquidityRows.map((row) => row.key)).size).toBe(2);
    expect(new Set(liquidityRows.map((row) => row.agent))).toEqual(new Set(["onchain", "decision"]));
  });

  it("marks a factor that named no source as unlinked rather than dropping it", () => {
    const { explanation } = explain(completeAndUnlinkedReport);

    const unlinked = explanation.contributions.find((entry) => entry.label === "What would change this decision");
    expect(unlinked?.evidence.state).toBe("unlinked");
    expect(unlinked?.evidence.note).toMatch(/did not name a source/i);
  });

  it("marks a factor naming an unlisted source as label-only", () => {
    const { explanation } = explain(nonAdditiveAndConflictingReport);

    const labelOnly = explanation.contributions.find((entry) => entry.label === "Clawback enabled");
    expect(labelOnly?.evidence.state).toBe("label_only");
    expect(labelOnly?.evidence.claimedLabel).toBe("Unlisted Provider");
    expect(labelOnly?.evidence.source).toBeUndefined();
  });

  it("separates descriptive factors from scored ones", () => {
    const { explanation } = explain(completeAndUnlinkedReport);

    const descriptive = explanation.contributions.filter((entry) => entry.kind === "descriptive");
    expect(descriptive.length).toBeGreaterThan(0);
    for (const entry of descriptive) {
      expect(entry.impact).toBeNull();
    }
  });
});

describe("score reconciliation", () => {
  it("never presents an exact decomposition of buy risk", () => {
    const { explanation } = explain(completeAndUnlinkedReport);

    expect(explanation.reconciliation.model).toBe("non_additive");
    expect(explanation.reconciliation.attributedBuyRisk).toBeNull();
    expect(explanation.reconciliation.unexplainedRemainder).toBeNull();
    expect(explanation.reconciliation.qualifiers.join(" ")).toMatch(/do not sum to it/i);
  });

  it("reports an agent as non-additive when its factors carry no weights", () => {
    const { explanation } = explain(completeAndUnlinkedReport);

    const onchain = explanation.reconciliation.perAgent.find((agent) => agent.agent === "onchain");
    expect(onchain?.model).toBe("non_additive");
    expect(onchain?.attributedScore).toBeNull();
    expect(onchain?.qualifiers.join(" ")).toMatch(/not as shares of its score/i);
  });

  it("reconciles an agent whose weighted factors reproduce its score", () => {
    const { explanation } = explain(additiveReport);

    const onchain = explanation.reconciliation.perAgent.find((agent) => agent.agent === "onchain");
    expect(onchain?.model).toBe("additive");
    expect(onchain?.attributedScore).toBe(40);
    expect(onchain?.unexplainedRemainder).toBe(0);
  });

  it("flags factors whose direction contradicts the sign of their impact", () => {
    const { explanation, contradictions } = explain(nonAdditiveAndConflictingReport);

    expect(contradictions.length).toBe(1);
    expect(explanation.reconciliation.qualifiers.join(" ")).toMatch(/contradicts the sign/i);
  });
});

describe("report immutability and ordering", () => {
  it("leaves the supplied report byte-equivalent", () => {
    const report = clone(completeAndUnlinkedReport);
    const before = JSON.stringify(report);

    explain(report);

    expect(JSON.stringify(report)).toBe(before);
  });

  it("produces the same semantic output when factors are reordered", () => {
    const reordered = clone(completeAndUnlinkedReport);
    reordered.agentCards[0].factors.reverse();
    reordered.agentCards.reverse();

    const baseline = explain(completeAndUnlinkedReport).explanation;
    const shuffled = explain(reordered).explanation;

    expect(shuffled.contributions.map((entry) => entry.key)).toEqual(baseline.contributions.map((entry) => entry.key));
    expect(shuffled.coverage).toEqual(baseline.coverage);
    expect(shuffled.reconciliation).toEqual(baseline.reconciliation);
  });
});

describe("canonical identity", () => {
  it("keeps the same symbol on different networks distinct", () => {
    const pubnet = canonicalAssetIdentity(nonAdditiveAndConflictingReport);
    const testnet = canonicalAssetIdentity(sameSymbolTestnetReport);

    expect(pubnet.symbol).toBe(testnet.symbol);
    expect(pubnet.identityKey).not.toBe(testnet.identityKey);
    expect(pubnet.family).toBe("stellar");
  });
});

describe("coverage states", () => {
  it("distinguishes complete, partial and empty results", () => {
    expect(explain(additiveReport).explanation.coverage.state).toBe("complete");
    expect(explain(completeAndUnlinkedReport).explanation.coverage.state).toBe("partial");
    expect(explain(emptyReport).explanation.coverage.state).toBe("empty");
  });

  it("treats an empty report as a valid result rather than a failure", () => {
    const { explanation } = explain(emptyReport);

    expect(explanation.contributions).toHaveLength(0);
    expect(explanation.coverage.note).toMatch(/nothing to explain/i);
    expect(explanation.tree.children.length).toBeGreaterThan(0);
  });
});

describe("critical blockers", () => {
  it("surfaces critical factors separately from the filtered set", () => {
    const { explanation } = explain(nonAdditiveAndConflictingReport);

    expect(explanation.criticalBlockers.map((entry) => entry.label)).toContain("Clawback enabled");
    expect(explanation.coverage.criticalBlockers).toBe(explanation.criticalBlockers.length);
  });
});

describe("declared gaps", () => {
  it("collects report-level and agent-level gaps without double counting", () => {
    const { explanation } = explain(nonAdditiveAndConflictingReport);

    expect(explanation.confidenceGaps.map((gap) => gap.field)).toEqual(["liquidity_depth", "issuer_home_domain"]);
    expect(explanation.confidenceGaps[0].scope).toBe("report");
    expect(explanation.confidenceGaps[1].scope).toBe("onchain");
  });
});

describe("validation", () => {
  it("rejects an unsupported report version", () => {
    expect(() => explainReport({ reportVersion: "risk-report/v9", report: completeAndUnlinkedReport })).toThrow(
      ExplanationValidationError,
    );
  });

  it("rejects a report that does not match the readable shape", () => {
    expect(() => explain({ id: "broken" })).toThrow(ExplanationValidationError);
  });

  it("rejects a report above the per-agent factor bound", () => {
    const oversized = clone(completeAndUnlinkedReport);
    oversized.agentCards[0].factors = Array.from({ length: 200 }, (_, index) => ({
      ...completeAndUnlinkedReport.agentCards[0].factors[0],
      label: `Generated factor ${index}`,
    }));

    let thrown: unknown;
    try {
      explain(oversized);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ExplanationValidationError);
    expect((thrown as ExplanationValidationError).code).toBe("invalid_request");
  });

  it("rejects a report above the total factor bound", () => {
    const oversized = clone(completeAndUnlinkedReport);
    const template = completeAndUnlinkedReport.agentCards[0];

    oversized.agentCards = Array.from({ length: 6 }, (_, cardIndex) => ({
      ...clone(template),
      agent: `bulk-${cardIndex}`,
      displayName: `Bulk agent ${cardIndex}`,
      factors: Array.from({ length: 110 }, (_, index) => ({
        ...template.factors[0],
        label: `Generated factor ${cardIndex}-${index}`,
      })),
    }));

    let thrown: unknown;
    try {
      explain(oversized);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ExplanationValidationError);
    expect((thrown as ExplanationValidationError).code).toBe("report_too_large");
  });
});
