import { describe, expect, it } from "vitest";
import { alignLedgers, summarizeLag } from "@/server/research/rpc-consistency/ledgerAlignment";
import type { FieldComparison, ProviderStatus } from "@/server/research/rpc-consistency/schema";

const providers: ProviderStatus[] = [
  {
    provider: "horizon",
    availability: "available",
    label: "Horizon",
    latestLedger: 5100,
    retentionStartLedger: 1000,
    retentionEndLedger: 5100,
    network: "testnet",
    endpoint: "https://horizon-testnet.stellar.org",
    detail: "",
  },
  {
    provider: "rpc",
    availability: "available",
    label: "Stellar RPC",
    latestLedger: 5000,
    retentionStartLedger: 900,
    retentionEndLedger: 5000,
    network: "testnet",
    endpoint: "https://soroban-testnet.stellar.org",
    detail: "",
  },
];

function field(over: Partial<FieldComparison>): FieldComparison {
  return {
    fieldId: "native_balance",
    kind: "native_balance",
    label: "Native balance",
    classification: "lagging",
    horizon: { ledger: 5000, value: "1", raw: 1 },
    rpc: { ledger: 4900, value: "2", raw: 2 },
    conflict: null,
    note: "",
    ...over,
  };
}

describe("ledger alignment", () => {
  it("treats equal ledgers as the same moment", () => {
    expect(alignLedgers(5000, 5000)).toEqual({ relation: "same", gap: 0, behind: null });
  });

  it("names which provider is behind", () => {
    expect(alignLedgers(4900, 5000)).toEqual({ relation: "lag", gap: 100, behind: "horizon" });
    expect(alignLedgers(5000, 4900)).toEqual({ relation: "lag", gap: 100, behind: "rpc" });
  });

  it("does not invent equality when a ledger is missing", () => {
    expect(alignLedgers(null, 5000).relation).toBe("unknown");
    expect(alignLedgers(1.5, 2).relation).toBe("unknown");
  });

  it("summarises field lag separately from the providers' latest ledgers", () => {
    const summary = summarizeLag([field({})], providers);

    expect(summary.laggingFieldCount).toBe(1);
    expect(summary.largestFieldGap).toBe(100);
    expect(summary.trailingProvider).toBe("rpc");
    expect(summary.providerLedgerGap).toBe(100);
    expect(summary.note).toMatch(/not a conflict/i);
  });
});
