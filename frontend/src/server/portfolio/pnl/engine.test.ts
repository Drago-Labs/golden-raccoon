import { describe, expect, it } from "vitest";
import { calculateCostBasis } from "@/server/portfolio/pnl/engine";

describe("FIFO cost-basis engine", () => {
  it("consumes buys in FIFO order and computes realized P&L", () => {
    const result = calculateCostBasis([
      { id: "buy-1", timestamp: "2026-01-01T00:00:00Z", kind: "buy", asset: "USDC", quantityBaseUnits: "10", unitPriceUsd: "1" },
      { id: "buy-2", timestamp: "2026-01-02T00:00:00Z", kind: "buy", asset: "USDC", quantityBaseUnits: "5", unitPriceUsd: "0.8" },
      { id: "sell-1", timestamp: "2026-01-03T00:00:00Z", kind: "sell", asset: "USDC", quantityBaseUnits: "12", unitPriceUsd: "1.2" },
    ], { USDC: "3" }, { USDC: "1.2" });
    expect(result.status).toBe("complete");
    expect(result.realized[0]).toMatchObject({ asset: "usdc", proceedsUsd: "14.4", costBasisUsd: "11.6", pnlUsd: "2.8" });
    expect(result.lots[0]).toMatchObject({ quantityBaseUnits: "3", costBasisUsd: "2.4" });
  });

  it("tracks swaps, fees, and unknown basis without inventing a price", () => {
    const result = calculateCostBasis([
      { id: "transfer", timestamp: "2026-01-01T00:00:00Z", kind: "transfer", asset: "MEME", quantityBaseUnits: "10" },
      { id: "swap", timestamp: "2026-01-02T00:00:00Z", kind: "swap", asset: "MEME", quantityBaseUnits: "4", counterAsset: "USDC", counterQuantityBaseUnits: "8", counterUnitPriceUsd: "1" },
      { id: "fee", timestamp: "2026-01-03T00:00:00Z", kind: "fee", asset: "USDC", quantityBaseUnits: "1", unitPriceUsd: "1" },
    ], { meme: "6", usdc: "7" });
    expect(result.status).toBe("incomplete");
    expect(result.unknownBasisAssets).toContain("meme");
    expect(result.lots.find((lot) => lot.asset === "usdc")?.quantityBaseUnits).toBe("7");
  });

  it("flags balance reconciliation drift", () => {
    const result = calculateCostBasis([{ id: "buy", timestamp: "2026-01-01", kind: "buy", asset: "ETH", quantityBaseUnits: "2", unitPriceUsd: "1000" }], { ETH: "3" });
    expect(result.reconciliation[0]).toMatchObject({ ok: false, deltaBaseUnits: "-1" });
    expect(result.status).toBe("incomplete");
  });
});
