import { describe, expect, it } from "vitest";
import { classifyField } from "@/server/research/rpc-consistency/classify";
import type { NormalizedField } from "@/server/research/rpc-consistency/schema";

const both = { horizonAvailable: true, rpcAvailable: true };

function field(over: Partial<NormalizedField> = {}): NormalizedField {
  return {
    fieldId: "native_balance",
    kind: "native_balance",
    label: "Native balance",
    horizon: { ledger: 5000, value: "100", raw: { balance: "10.0000000" } },
    rpc: { ledger: 5000, value: "100", raw: { balance: "100" } },
    ...over,
  };
}

describe("classify", () => {
  it("matches equal values at the same ledger", () => {
    const result = classifyField(field(), both);

    expect(result.classification).toBe("matched");
    expect(result.conflict).toBeNull();
  });

  it("keeps both raw values when the same ledger disagrees", () => {
    const result = classifyField(
      field({ rpc: { ledger: 5000, value: "90", raw: { balance: "90000000" } } }),
      both,
    );

    expect(result.classification).toBe("conflicting");
    expect(result.conflict).toEqual({
      horizonRaw: { balance: "10.0000000" },
      rpcRaw: { balance: "90000000" },
    });
  });

  it("classifies different ledgers as lag even when the values differ", () => {
    const result = classifyField(
      field({
        horizon: { ledger: 5000, value: "100", raw: { balance: "10.0000000" } },
        rpc: { ledger: 4900, value: "90", raw: { balance: "90000000" } },
      }),
      both,
    );

    expect(result.classification).toBe("lagging");
    expect(result.conflict).toBeNull();
    expect(result.note).toMatch(/not a conflict/i);
  });

  it("does not call a missing ledger a conflict", () => {
    const result = classifyField(
      field({ rpc: { ledger: null, value: "90", raw: { balance: "90" } } }),
      both,
    );

    expect(result.classification).toBe("lagging");
    expect(result.conflict).toBeNull();
  });

  it("labels a single provider when the other is unavailable", () => {
    const result = classifyField(field({ horizon: null }), { horizonAvailable: false, rpcAvailable: true });

    expect(result.classification).toBe("single_source");
    expect(result.note).toMatch(/Horizon is unavailable/);
    expect(result.note).toMatch(/single-source/);
  });
});
