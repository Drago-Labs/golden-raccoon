import { Asset } from "@stellar/stellar-sdk";
import { createStellarDataServer } from "@/server/stellar/client";
import {
  type AssetIdentifier,
  type OrderbookLevel,
  type VenueSnapshot,
} from "./schema";

export type FetchOrderbookParams = {
  baseAsset: AssetIdentifier;
  quoteAsset: AssetIdentifier;
  network?: string;
  limit?: number;
};

/**
 * Maps an internal AssetIdentifier to a Stellar SDK Asset.
 */
export function toStellarAsset(asset: AssetIdentifier): Asset {
  const sym = asset.symbol.toUpperCase();
  if (sym === "XLM" || sym === "NATIVE") {
    return Asset.native();
  }
  if (asset.issuer) {
    return new Asset(asset.symbol, asset.issuer);
  }
  if (asset.addressOrCode.includes(":")) {
    const [code, issuer] = asset.addressOrCode.split(":");
    return new Asset(code, issuer);
  }
  return new Asset(asset.symbol, asset.addressOrCode);
}

/**
 * Fetches an order book snapshot from Stellar Horizon with boundary guards.
 */
export async function fetchStellarOrderbookSnapshot(
  params: FetchOrderbookParams,
): Promise<VenueSnapshot> {
  const network = params.network || "stellar-pubnet";
  const limit = Math.min(Math.max(params.limit || 50, 1), 100);

  const baseStellarAsset = toStellarAsset(params.baseAsset);
  const quoteStellarAsset = toStellarAsset(params.quoteAsset);

  try {
    const { server } = createStellarDataServer(network);
    const horizonOrderbook = await server
      .orderbook(baseStellarAsset, quoteStellarAsset)
      .limit(limit)
      .call();

    const asks: OrderbookLevel[] = (horizonOrderbook.asks || []).map((lvl) => ({
      price: lvl.price,
      amount: lvl.amount,
    }));

    const bids: OrderbookLevel[] = (horizonOrderbook.bids || []).map((lvl) => ({
      price: lvl.price,
      amount: lvl.amount,
    }));

    const isTruncated = asks.length >= limit || bids.length >= limit;

    return {
      venueId: `stellar-sdex-${params.baseAsset.symbol}-${params.quoteAsset.symbol}`.toLowerCase(),
      venueName: "Stellar SDEX (Horizon)",
      chainFamily: "stellar",
      network,
      baseAsset: params.baseAsset,
      quoteAsset: params.quoteAsset,
      modelType: "orderbook",
      timestamp: new Date().toISOString(),
      ledgerOrBlock: 0,
      feeBps: 0,
      orderbook: { bids, asks },
      isStale: false,
      isTruncated,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      venueId: `stellar-sdex-${params.baseAsset.symbol}-${params.quoteAsset.symbol}`.toLowerCase(),
      venueName: "Stellar SDEX (Horizon)",
      chainFamily: "stellar",
      network,
      baseAsset: params.baseAsset,
      quoteAsset: params.quoteAsset,
      modelType: "orderbook",
      unsupportedReason: `Failed to fetch order book from Horizon: ${message}`,
      timestamp: new Date().toISOString(),
      ledgerOrBlock: 0,
      feeBps: 0,
      orderbook: { bids: [], asks: [] },
      isStale: true,
      isTruncated: false,
    };
  }
}
