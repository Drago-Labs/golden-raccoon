import { describe, expect, it } from "vitest";
import { decimalToStroops } from "@/server/research/reserve-planner/amounts";
import { reservePlannerRequestSchema } from "@/server/research/reserve-planner/schema";

const stellarWallet = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

if (typeof window !== "undefined" && !window.localStorage) {
  const values = new Map<string, string>();
  Object.defineProperty(window, "localStorage", { value: { get length() { return values.size; }, clear: () => values.clear(), getItem: (key: string) => values.get(key) ?? null, key: (index: number) => [...values.keys()][index] ?? null, removeItem: (key: string) => values.delete(key), setItem: (key: string, value: string) => values.set(key, value) } });
}

describe("reserve planner validation", () => {
  it("parses decimal XLM without floating point", () => {
    expect(decimalToStroops("1.0000001")).toBe(10_000_001n);
    expect(() => decimalToStroops("1.00000001")).toThrow();
  });

  it("rejects network mismatch, invalid accounts and unbounded scenarios", () => {
    expect(reservePlannerRequestSchema.safeParse({ walletAddress: stellarWallet, network: "stellar-pubnet", walletNetwork: "stellar-testnet", scenario: { action: "none", count: 1 } }).success).toBe(false);
    expect(reservePlannerRequestSchema.safeParse({ walletAddress: "GINVALID", network: "stellar-testnet" }).success).toBe(false);
    expect(reservePlannerRequestSchema.safeParse({ walletAddress: stellarWallet, network: "stellar-testnet", scenario: { action: "add_entry", count: 21 } }).success).toBe(false);
  });
});
