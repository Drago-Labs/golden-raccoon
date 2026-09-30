import { describe, expect, it } from "vitest";
import { analyseReserveAttestations } from "@/server/research/reserve-attestation";
import { baseRequest, HASH_A, HASH_B, registryEntry, report } from "./fixtures";

describe("reserve attestation analysis", () => {
  it("computes a coverage ratio for a well-formed matched report", () => {
    const result = analyseReserveAttestations(baseRequest());
    expect(result.assets[0].latestCoverageRatioBps).toBe(10_000);
    expect(result.assets[0].evidence[0].status).toBe("on_time");
  });

  it("keeps two issuers of the same asset code from sharing attestations", () => {
    const result = analyseReserveAttestations(
      baseRequest({
        registry: [registryEntry({ issuer: "Issuer One" }), registryEntry({ issuer: "Issuer Two" })],
        reports: [
          report({ issuer: "Issuer One", documentHash: HASH_A, claimedAssets: "900000" }),
          report({ issuer: "Issuer Two", documentHash: HASH_B, claimedAssets: "500000" }),
        ],
      }),
    );
    const one = result.assets.find((a) => a.registryEntry.issuer === "Issuer One")!;
    const two = result.assets.find((a) => a.registryEntry.issuer === "Issuer Two")!;
    expect(one.evidence).toHaveLength(1);
    expect(two.evidence).toHaveLength(1);
    expect(one.evidence[0].documentHash).toBe(HASH_A);
    expect(two.evidence[0].documentHash).toBe(HASH_B);
  });

  it("never turns a missing report into a 100% backed claim", () => {
    const result = analyseReserveAttestations(baseRequest({ reports: [] }));
    expect(result.assets[0].state).toBe("no_evidence");
    expect(result.assets[0].latestCoverageRatioBps).toBeNull();
  });

  it("never computes a ratio across mismatched currencies", () => {
    const result = analyseReserveAttestations(
      baseRequest({
        reports: [
          report({ documentHash: HASH_A, currency: "USD", reportingPeriodEnd: "2026-01-31T00:00:00Z" }),
          report({ documentHash: HASH_B, currency: "EUR", reportingPeriodEnd: "2026-02-28T00:00:00Z", retrievedAt: "2026-03-05T00:00:00Z" }),
        ],
      }),
    );
    const mismatched = result.assets[0].evidence.find((e) => e.documentHash === HASH_B)!;
    expect(mismatched.coverageRatioBps).toBeNull();
    expect(mismatched.coverageNote).toMatch(/differs/);
  });

  it("rejects malformed claimed figures rather than computing a false ratio", () => {
    const result = analyseReserveAttestations(baseRequest({ reports: [report({ claimedLiabilities: "0" })] }));
    expect(result.assets[0].evidence[0].coverageRatioBps).toBeNull();
    expect(result.assets[0].state).toBe("partial");
  });

  it("marks a report retrieved long after its period end as late", () => {
    const result = analyseReserveAttestations(
      baseRequest({
        reports: [report({ retrievedAt: "2026-06-01T00:00:00Z" })],
      }),
    );
    expect(result.assets[0].evidence[0].status).toBe("late");
  });

  it("flags a source outside the registry's permitted list without discarding the report", () => {
    const result = analyseReserveAttestations(
      baseRequest({
        registry: [registryEntry({ permittedSourceLabels: ["Only This Firm"] })],
      }),
    );
    expect(result.assets[0].evidence[0].status).toBe("unlisted_source");
    expect(result.assets[0].evidence).toHaveLength(1);
  });

  it("shows a document revision with its own hash and retrieval time, and marks the prior one superseded", () => {
    const result = analyseReserveAttestations(
      baseRequest({
        reports: [
          report({ documentHash: HASH_A, retrievedAt: "2026-02-05T00:00:00Z" }),
          report({ documentHash: HASH_B, revisionOf: HASH_A, retrievedAt: "2026-02-10T00:00:00Z", claimedAssets: "950000" }),
        ],
      }),
    );
    const original = result.assets[0].evidence.find((e) => e.documentHash === HASH_A)!;
    const revision = result.assets[0].evidence.find((e) => e.documentHash === HASH_B)!;
    expect(original.superseded).toBe(true);
    expect(revision.superseded).toBe(false);
    expect(revision.supersedes).toEqual([HASH_A]);
    expect(result.assets[0].latestCoverageRatioBps).toBe(revision.coverageRatioBps);
  });

  it("excludes a report for an unregistered issuer rather than attributing it to a similarly named one", () => {
    const result = analyseReserveAttestations(
      baseRequest({
        reports: [report(), report({ issuer: "Unregistered Issuer", documentHash: HASH_B })],
      }),
    );
    expect(result.assets[0].evidence).toHaveLength(1);
    expect(result.unregisteredReports).toEqual([{ assetCode: "USDX", issuer: "Unregistered Issuer", documentHash: HASH_B }]);
  });

  it("rejects a window whose end precedes its start", () => {
    expect(() => analyseReserveAttestations(baseRequest({ windowEnd: "2025-01-01T00:00:00Z" }))).toThrow();
  });
});
