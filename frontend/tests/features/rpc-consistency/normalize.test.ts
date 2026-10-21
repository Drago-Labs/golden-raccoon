import { describe, expect, it } from "vitest";
import { canonicalInteger, decimalToStroops, normalizeObservations } from "@/server/research/rpc-consistency/normalize";
import { conflicting, contractOnlyFixture, matched } from "./fixtures";

describe("normalize", () => {
  it("converts Horizon decimals to stroops without floating point", () => {
    expect(decimalToStroops("10.0000000")).toBe("100000000");
    expect(decimalToStroops("10.0")).toBe("100000000");
    expect(decimalToStroops("0.0000001")).toBe("1");
    expect(decimalToStroops("922337203685.4775807")).toBe("9223372036854775807");
  });

  it("refuses amounts that would have to be rounded", () => {
    expect(decimalToStroops("10.00000001")).toBeNull();
    expect(decimalToStroops("-1.0")).toBeNull();
    expect(decimalToStroops("1e7")).toBeNull();
  });

  it("canonicalises sequence integers", () => {
    expect(canonicalInteger("000123")).toBe("123");
    expect(canonicalInteger("abc")).toBeNull();
  });

  it("pairs the same trustline from both providers", () => {
    const horizon = matched.horizon.status === "available" ? matched.horizon.observation : null;
    const rpc = matched.rpc.status === "available" ? matched.rpc.observation : null;
    const fields = normalizeObservations({ horizon, rpc });
    const trustline = fields.find((field) => field.kind === "trustline");

    expect(trustline?.horizon?.value).toBe("250000000/1000000000");
    expect(trustline?.rpc?.value).toBe("250000000/1000000000");
    expect(fields.find((field) => field.fieldId === "native_balance")?.horizon?.value).toBe("100000000");
    expect(fields.find((field) => field.fieldId === "native_balance")?.rpc?.value).toBe("100000000");
  });

  it("keeps a contract entry that only RPC returned", () => {
    const fixture = contractOnlyFixture();
    const fields = normalizeObservations({
      horizon: fixture.horizon.status === "available" ? fixture.horizon.observation : null,
      rpc: fixture.rpc.status === "available" ? fixture.rpc.observation : null,
    });

    expect(fields.map((field) => field.fieldId)).toEqual(["contract_data:counter"]);
    expect(fields[0]?.horizon).toBeNull();
    expect(fields[0]?.rpc?.value).toBe('"7"');
  });

  it("does not treat a same-ledger balance gap as equal", () => {
    const horizon = conflicting.horizon.status === "available" ? conflicting.horizon.observation : null;
    const rpc = conflicting.rpc.status === "available" ? conflicting.rpc.observation : null;
    const native = normalizeObservations({ horizon, rpc }).find((field) => field.fieldId === "native_balance");

    expect(native?.horizon?.value).not.toBe(native?.rpc?.value);
    expect(native?.horizon?.ledger).toBe(native?.rpc?.ledger);
  });
});
