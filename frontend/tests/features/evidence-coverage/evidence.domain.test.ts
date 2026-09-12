import { describe, expect, it } from "vitest";
import { EvidenceError } from "@/server/research/evidence-coverage/schema";
import { exploreEvidence } from "@/server/research/evidence-coverage/service";
import {
  comparableAndIncomparableConflicts,
  duplicateSourceFamilies,
  emptyReport,
  equivalentNumberFormats,
  sameSymbolDifferentChains,
  staleMissingSecretFields,
  uncoveredClaim,
} from "./fixtures";

describe("independence, not volume", () => {
  it("does not count repeated observations from one family as corroboration", () => {
    const report = exploreEvidence(duplicateSourceFamilies);
    const supply = report.claims.find((claim) => claim.claimId === "claim-supply");

    expect(supply?.observationIds).toHaveLength(3);
    expect(supply?.independentFamilyCount).toBe(1);
    expect(supply?.state).toBe("single_family");
    expect(supply?.redundantObservationCount).toBe(2);
    expect(supply?.note).toMatch(/repeating a source is not corroboration/i);
  });

  it("counts two genuinely independent families as corroboration", () => {
    const report = exploreEvidence(duplicateSourceFamilies);
    const holders = report.claims.find((claim) => claim.claimId === "claim-holders");

    expect(holders?.independentFamilyCount).toBe(2);
    expect(holders?.state).toBe("corroborated");
  });

  it("treats an undeclared source as its own family rather than pooling it", () => {
    const report = exploreEvidence(staleMissingSecretFields);
    const observation = report.observations.find((entry) => entry.observationId === "hygiene-undated");

    expect(observation?.familyId).toBe("ungrouped:undeclared source");
    expect(observation?.familyLabel).toBe("Undeclared Source");
  });

  it("does not let an unavailable source contribute independence", () => {
    const report = exploreEvidence(uncoveredClaim);
    const claim = report.claims[0];

    expect(claim.independentFamilyCount).toBe(0);
    expect(claim.state).toBe("uncovered");
    expect(claim.note).toMatch(/nothing backs it/i);
  });
});

describe("provable contradictions only", () => {
  it("reports a genuine conflict between comparable observations", () => {
    const report = exploreEvidence(comparableAndIncomparableConflicts);
    const conflicts = report.contradictions.filter((entry) => entry.claimId === "claim-real-conflict");

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].difference).toBe("50000 vs 90000");
    expect(report.claims.find((claim) => claim.claimId === "claim-real-conflict")?.state).toBe("contradicted");
  });

  it("never reports a unit mismatch as a contradiction", () => {
    const report = exploreEvidence(comparableAndIncomparableConflicts);

    expect(report.contradictions.some((entry) => entry.claimId === "claim-unit-mismatch")).toBe(false);
    const rejected = report.incomparablePairs.find((entry) => entry.claimId === "claim-unit-mismatch");
    expect(rejected?.reason).toBe("different_unit");
    expect(rejected?.detail).toMatch(/unit mismatch, not a disagreement/i);
  });

  it("does not let an incomparable pair manufacture corroboration either", () => {
    const report = exploreEvidence(comparableAndIncomparableConflicts);

    for (const claimId of ["claim-unit-mismatch", "claim-disjoint-windows", "claim-free-text"]) {
      const claim = report.claims.find((entry) => entry.claimId === claimId);
      expect(claim?.independentFamilyCount).toBe(2);
      expect(claim?.state).toBe("incomparable");
      expect(claim?.agreeingPairCount).toBe(0);
      expect(claim?.note).toMatch(/neither agree nor disagree/i);
    }
  });

  it("never reports disjoint windows as a contradiction", () => {
    const report = exploreEvidence(comparableAndIncomparableConflicts);

    expect(report.contradictions.some((entry) => entry.claimId === "claim-disjoint-windows")).toBe(false);
    const rejected = report.incomparablePairs.find((entry) => entry.claimId === "claim-disjoint-windows");
    expect(rejected?.reason).toBe("disjoint_windows");
    expect(rejected?.detail).toMatch(/change over time, not a contradiction/i);
  });

  it("never adjudicates free text", () => {
    const report = exploreEvidence(comparableAndIncomparableConflicts);

    expect(report.contradictions.some((entry) => entry.claimId === "claim-free-text")).toBe(false);
    const rejected = report.incomparablePairs.find((entry) => entry.claimId === "claim-free-text");
    expect(rejected?.reason).toBe("unstructured_value");
    expect(rejected?.detail).toMatch(/free text is not adjudicated/i);
  });

  it("keeps assets that share a symbol on different chains as separate claims", () => {
    const report = exploreEvidence(sameSymbolDifferentChains);
    const keys = report.claims.map((claim) => claim.subjectIdentityKey);

    expect(new Set(keys).size).toBe(2);
    expect(report.contradictions).toHaveLength(0);
  });

  it("does not treat differently written equal numbers as a conflict", () => {
    const report = exploreEvidence(equivalentNumberFormats);

    expect(report.contradictions).toHaveLength(0);
    expect(report.claims[0].state).toBe("corroborated");
  });

  it("records every rejected comparison with its reason", () => {
    const report = exploreEvidence(comparableAndIncomparableConflicts);

    expect(report.incomparablePairs).toHaveLength(3);
    expect(new Set(report.incomparablePairs.map((entry) => entry.reason))).toEqual(
      new Set(["different_unit", "disjoint_windows", "unstructured_value"]),
    );
  });
});

describe("freshness", () => {
  it("treats a missing timestamp as unknown, not fresh", () => {
    const report = exploreEvidence(staleMissingSecretFields);
    const undated = report.observations.find((entry) => entry.observationId === "hygiene-undated");

    expect(undated?.freshness).toBe("unknown");
    expect(undated?.ageSeconds).toBeNull();
    expect(undated?.note).toMatch(/not the same as recent/i);
  });

  it("keeps status and age separately inspectable", () => {
    const report = exploreEvidence(staleMissingSecretFields);
    const stale = report.observations.find((entry) => entry.observationId === "hygiene-stale");

    expect(stale?.status).toBe("connected");
    expect(stale?.freshness).toBe("stale");
    expect(stale?.ageSeconds).toBe(7_200);
  });

  it("buckets undated observations separately on the timeline", () => {
    const report = exploreEvidence(staleMissingSecretFields);
    const undatedBucket = report.timeline.find((bucket) => bucket.observedAt === null);

    expect(undatedBucket?.observationIds).toContain("hygiene-undated");
    expect(undatedBucket?.freshness).toBe("unknown");
  });

  it("drops the value of an unavailable source", () => {
    const report = exploreEvidence(staleMissingSecretFields);
    const unavailable = report.observations.find((entry) => entry.observationId === "hygiene-unavailable");

    expect(unavailable?.value).toBeNull();
    expect(unavailable?.note).toMatch(/carries no value/i);
  });
});

describe("redaction", () => {
  it("never forwards a provider payload", () => {
    const report = exploreEvidence(staleMissingSecretFields);
    const serialized = JSON.stringify(report);

    expect(serialized).not.toContain("should-never-appear");
    expect(serialized).not.toContain("sk-live");
  });

  it("reports that a payload was dropped, and names the credential-shaped keys", () => {
    const report = exploreEvidence(staleMissingSecretFields);
    const stale = report.observations.find((entry) => entry.observationId === "hygiene-stale");

    expect(stale?.redacted).toBe(true);
    expect(stale?.note).toMatch(/5 fields removed/i);
    expect(stale?.note).toMatch(/apiKey/);
    expect(stale?.note).toMatch(/walletSeed/);
  });

  it("counts redacted fields in report coverage", () => {
    const report = exploreEvidence(staleMissingSecretFields);

    expect(report.coverage.redactedFieldCount).toBe(5);
  });

  it("drops harmless fields too, because the whole bag is denied", () => {
    const report = exploreEvidence(staleMissingSecretFields);

    expect(JSON.stringify(report)).not.toContain("harmlessField");
  });
});

describe("coverage states", () => {
  it("distinguishes complete, partial and empty", () => {
    expect(exploreEvidence(equivalentNumberFormats).coverage.state).toBe("complete");
    expect(exploreEvidence(duplicateSourceFamilies).coverage.state).toBe("partial");
    expect(exploreEvidence(emptyReport).coverage.state).toBe("empty");
  });

  it("names the shortfall rather than rounding it away", () => {
    const coverage = exploreEvidence(comparableAndIncomparableConflicts).coverage;

    expect(coverage.contradictedClaimCount).toBe(1);
    expect(coverage.incomparableClaimCount).toBe(3);
    expect(coverage.corroboratedClaimCount).toBe(0);
    expect(coverage.note).toMatch(/provable conflict/i);
    expect(coverage.note).toMatch(/could not be compared/i);
  });

  it("treats an empty report as a valid result", () => {
    const report = exploreEvidence(emptyReport);

    expect(report.claims).toHaveLength(0);
    expect(report.coverage.note).toMatch(/no coverage to assess/i);
  });
});

describe("purity", () => {
  it("does not recompute any score or fetch anything", () => {
    const report = exploreEvidence(duplicateSourceFamilies);
    const keys = new Set<string>();

    const walk = (value: unknown) => {
      if (Array.isArray(value)) return value.forEach(walk);
      if (value && typeof value === "object") {
        for (const [key, child] of Object.entries(value)) {
          keys.add(key.toLowerCase());
          walk(child);
        }
      }
    };

    walk(report);

    for (const forbidden of ["score", "buyrisk", "verdict", "url", "href", "endpoint"]) {
      expect(keys.has(forbidden)).toBe(false);
    }
  });

  it("does not mutate the supplied request", () => {
    const before = JSON.stringify(duplicateSourceFamilies);
    exploreEvidence(duplicateSourceFamilies);
    expect(JSON.stringify(duplicateSourceFamilies)).toBe(before);
  });

  it("is deterministic across repeated runs", () => {
    expect(exploreEvidence(duplicateSourceFamilies)).toEqual(exploreEvidence(duplicateSourceFamilies));
  });
});

describe("validation", () => {
  it("rejects a family with no rationale", () => {
    expect(() =>
      exploreEvidence({
        ...duplicateSourceFamilies,
        families: [{ familyId: "x", label: "X", memberLabels: ["Alpha Primary"] }],
      }),
    ).toThrow(EvidenceError);
  });

  it("rejects a non-numeric structured value", () => {
    expect(() =>
      exploreEvidence({
        ...duplicateSourceFamilies,
        claims: [
          {
            ...duplicateSourceFamilies.claims[0],
            observations: [
              {
                observationId: "bad",
                sourceLabel: "Alpha Primary",
                status: "connected",
                value: { kind: "number", amount: "not-a-number", unit: "USD" },
              },
            ],
          },
        ],
      }),
    ).toThrow(EvidenceError);
  });
});
