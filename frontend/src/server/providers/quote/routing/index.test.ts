import { describe, expect, it, vi } from "vitest";
import { aggregateQuotes, revalidateSelectedQuote } from "@/server/providers/quote/routing";
import type { QuoteResult } from "@/server/providers/quote/types";

function quote(overrides: Partial<QuoteResult> = {}): QuoteResult {
  return {
    provider: "stellar_horizon",
    routeType: "classic_path_payment",
    route: ["XLM", "USDC"],
    inputAmount: "100",
    expectedOutputAmount: "100",
    minReceiveAmount: "99",
    estimatedValueUsd: 100,
    priceImpactBps: 20,
    slippageBps: 100,
    feeEstimate: { nativeToken: "XLM", amount: "100", usdValue: 0.01 },
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    fetchedAt: new Date().toISOString(),
    status: "fresh",
    detail: "ok",
    providerMeta: { provider: "stellar_horizon", network: "stellar-testnet", latencyMs: 2 },
    ...overrides,
  };
}

describe("quote routing", () => {
  it("fetches venues concurrently and ranks by net output with deterministic tie breaks", async () => {
    const order: string[] = [];
    const result = await aggregateQuotes({} as any, [
      { id: "zeta", network: "stellar-testnet", fetch: async () => { order.push("zeta"); return quote({ expectedOutputAmount: "110" }); } },
      { id: "alpha", network: "stellar-testnet", fetch: async () => { order.push("alpha"); return quote({ expectedOutputAmount: "110", priceImpactBps: 10 }); } },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.selected.venue).toBe("alpha");
      expect(result.proof.tieBreak).toContain("price_impact_asc");
    }
    expect(order.sort()).toEqual(["alpha", "zeta"]);
  });

  it("excludes expired, cross-network, and over-impact quotes and returns typed no-route", async () => {
    const result = await aggregateQuotes({} as any, [
      { id: "expired", network: "stellar-testnet", fetch: async () => quote({ expiresAt: new Date(0).toISOString() }) },
      { id: "wrong-chain", network: "stellar-testnet", fetch: async () => quote({ providerMeta: { provider: "x", network: "stellar-pubnet", latencyMs: 1 } }) },
      { id: "deep-impact", network: "stellar-testnet", fetch: async () => quote({ priceImpactBps: 2_000 }) },
    ], { maxPriceImpactBps: 500 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("no_route");
      expect(result.exclusions.map((item) => item.reason)).toEqual(["expired", "cross_network", "price_impact"]);
    }
  });

  it("revalidates the selected route before prepare", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(quote())
      .mockResolvedValueOnce(quote({ expectedOutputAmount: "98" }));
    const initial = await aggregateQuotes({} as any, [{ id: "venue", network: "stellar-testnet", fetch }]);
    expect(initial.ok).toBe(true);
    if (initial.ok) {
      const refreshed = await revalidateSelectedQuote(initial, { id: "venue", network: "stellar-testnet", fetch });
      expect(refreshed.ok).toBe(true);
      expect(fetch).toHaveBeenCalledTimes(2);
    }
  });
});
