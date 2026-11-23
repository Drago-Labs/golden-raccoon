import type { PricePoint } from "./schema";

export type PriceReadOutcome =
  | { status: "available"; prices: PricePoint[]; source: string }
  | { status: "unavailable"; reason: string }
  | { status: "missing" };

export async function readPriceSeries(
  network: string,
  assetA: string,
  assetB: string,
  windowStart: number,
  windowEnd: number,
): Promise<PriceReadOutcome> {
  // Placeholder implementation - would query price oracle or trades
  // For now, return a minimal valid response
  return {
    status: "available",
    prices: [
      {
        ledger: windowStart,
        assetA,
        assetB,
        priceA: "1.0",
        priceB: "1.0",
      },
      {
        ledger: windowEnd,
        assetA,
        assetB,
        priceA: "1.05",
        priceB: "0.95",
      },
    ],
    source: "horizon-trades",
  };
}
