import { describe, expect, it } from "vitest";
import { applyRunningBalance, decimalToStroops, stroopsToDecimal } from "@/server/research/balance-reconciliation/runningBalance";

describe("running balance arithmetic", () => {
  it("keeps two issuers of USD apart and stays exact at the stroop", () => {
    const opening = new Map<string, bigint>([
      ["native", decimalToStroops("10.0000000")],
      ["USD:ISSUER_A", 0n],
      ["USD:ISSUER_B", 0n],
    ]);
    const balances = applyRunningBalance(opening, [
      { asset: "native", stroops: decimalToStroops("5.0000000") },
      { asset: "native", stroops: decimalToStroops("-1.0000000") },
      { asset: "native", stroops: -100n },
      { asset: "USD:ISSUER_A", stroops: decimalToStroops("2.0000000") },
      { asset: "USD:ISSUER_B", stroops: decimalToStroops("1.0000000") },
    ]);

    expect(balances.get("native")).toBe(139_999_900n);
    expect(stroopsToDecimal(balances.get("native") ?? 0n)).toBe("13.9999900");
    expect(balances.get("USD:ISSUER_A")).toBe(20_000_000n);
    expect(balances.get("USD:ISSUER_B")).toBe(10_000_000n);
    expect(balances.get("USD:ISSUER_A")).not.toBe(balances.get("USD:ISSUER_B"));
  });
});
