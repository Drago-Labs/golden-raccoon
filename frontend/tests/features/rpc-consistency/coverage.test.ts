import { describe, expect, it } from "vitest";
import { buildCoverage } from "@/server/research/rpc-consistency/coverage";
import type { FieldComparison, ProviderStatus } from "@/server/research/rpc-consistency/schema";

function provider(name: "horizon" | "rpc", availability: "available" | "unavailable"): ProviderStatus {
  return {
    provider: name,
    availability,
    label: name,
    latestLedger: availability === "available" ? 10 : null,
    retentionStartLedger: availability === "available" ? 1 : null,
    retentionEndLedger: availability === "available" ? 10 : null,
    network: "testnet",
    endpoint: "https://example.test",
    detail: "",
  };
}

function field(classification: FieldComparison["classification"], kind: FieldComparison["kind"] = "native_balance"): FieldComparison {
  return {
    fieldId: kind,
    kind,
    label: kind,
    classification,
    horizon: null,
    rpc: null,
    conflict: null,
    note: "",
  };
}

describe("coverage", () => {
  it("is complete only when every field matched", () => {
    const coverage = buildCoverage({
      fields: [field("matched"), field("matched", "sequence")],
      providers: [provider("horizon", "available"), provider("rpc", "available")],
      horizonContractDataExposed: false,
      omittedTrustlines: 0,
      omittedLedgerKeys: 0,
    });

    expect(coverage.state).toBe("complete");
    expect(coverage.matchedCount).toBe(2);
  });

  it("is single-source when one provider is down", () => {
    const coverage = buildCoverage({
      fields: [field("single_source")],
      providers: [provider("horizon", "unavailable"), provider("rpc", "available")],
      horizonContractDataExposed: false,
      omittedTrustlines: 0,
      omittedLedgerKeys: 0,
    });

    expect(coverage.state).toBe("single_source");
    expect(coverage.note).toMatch(/Horizon is unavailable/);
  });

  it("says when Horizon cannot show contract data", () => {
    const coverage = buildCoverage({
      fields: [field("single_source", "contract_data")],
      providers: [provider("horizon", "available"), provider("rpc", "available")],
      horizonContractDataExposed: false,
      omittedTrustlines: 0,
      omittedLedgerKeys: 0,
    });

    expect(coverage.state).toBe("partial");
    expect(coverage.note).toMatch(/does not expose contract data/);
  });

  it("is unavailable when both providers are down", () => {
    const coverage = buildCoverage({
      fields: [],
      providers: [provider("horizon", "unavailable"), provider("rpc", "unavailable")],
      horizonContractDataExposed: false,
      omittedTrustlines: 0,
      omittedLedgerKeys: 0,
    });

    expect(coverage.state).toBe("unavailable");
  });
});
