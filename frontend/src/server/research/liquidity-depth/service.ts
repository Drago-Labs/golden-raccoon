import {
  type AssetIdentifier,
  type LiquidityDepthResult,
  type VenueSnapshot,
} from "./schema";
import { evaluateCoverage } from "./coverage";
import { buildDepthCurve } from "./depthCurve";
import { buildSizeLadder } from "./priceImpact";
import { calculateCapacity } from "./capacity";
import { fetchStellarOrderbookSnapshot } from "./orderbookAdapter";
import { fetchEvmPoolSnapshot } from "./poolAdapter";

export type GetLiquidityDepthOptions = {
  venue?: VenueSnapshot;
  baseAsset?: AssetIdentifier;
  quoteAsset?: AssetIdentifier;
  network?: string;
  side?: "buy" | "sell";
  sizes?: string[];
  useFixture?: boolean;
};

const DEFAULT_STELLAR_SIZES = ["100", "500", "1000", "2500", "5000", "10000"];
const DEFAULT_EVM_SIZES = ["0.5", "1", "2.5", "5", "10", "25"];

/**
 * Resolves default size ladder based on chain family and asset symbol.
 */
function getDefaultSizes(chainFamily: "evm" | "stellar", symbol: string): string[] {
  if (chainFamily === "stellar") {
    return DEFAULT_STELLAR_SIZES;
  }
  const sym = symbol.toUpperCase();
  if (sym === "WBTC" || sym === "BTC") {
    return ["0.05", "0.1", "0.25", "0.5", "1", "2"];
  }
  if (["USDC", "USDT", "DAI"].includes(sym)) {
    return ["500", "1000", "5000", "10000", "25000", "50000"];
  }
  return DEFAULT_EVM_SIZES;
}

/**
 * Read-only analysis service providing liquidity depth, size ladders, and trade capacity.
 * This service never generates executable quotes, selects execution routes, or prepares transactions.
 */
export async function getLiquidityDepth(
  options: GetLiquidityDepthOptions,
): Promise<LiquidityDepthResult> {
  const side = options.side ?? "buy";

  let venue: VenueSnapshot;

  if (options.venue) {
    venue = options.venue;
  } else {
    const network = options.network ?? "stellar-pubnet";
    const isStellar = network.startsWith("stellar");

    const baseAsset: AssetIdentifier = options.baseAsset ?? {
      symbol: isStellar ? "XLM" : "ETH",
      addressOrCode: isStellar ? "native" : "0x0000000000000000000000000000000000000000",
      decimals: isStellar ? 7 : 18,
      chainFamily: isStellar ? "stellar" : "evm",
      network,
    };

    const quoteAsset: AssetIdentifier = options.quoteAsset ?? {
      symbol: "USDC",
      addressOrCode: isStellar ? "USDC" : "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      decimals: isStellar ? 7 : 6,
      chainFamily: isStellar ? "stellar" : "evm",
      network,
    };

    if (isStellar) {
      venue = await fetchStellarOrderbookSnapshot({
        baseAsset,
        quoteAsset,
        network,
      });
    } else {
      venue = await fetchEvmPoolSnapshot({
        baseAsset,
        quoteAsset,
        network,
      });
    }
  }

  const ladderSizes = options.sizes && options.sizes.length > 0
    ? options.sizes
    : getDefaultSizes(venue.chainFamily, venue.baseAsset.symbol);

  const coverage = evaluateCoverage(venue, ladderSizes);
  const curve = buildDepthCurve(venue);
  const ladder = buildSizeLadder(venue, ladderSizes, side, curve.midPrice);
  const capacity = calculateCapacity(venue, side, curve.midPrice);

  return {
    schemaVersion: "liquidity-depth/2026-01",
    venue,
    curve,
    ladder,
    capacity,
    coverage,
    disclaimer:
      "Informational liquidity depth and trade capacity analysis only. Never creates executable quotes, selects production routes, or prepares blockchain transactions.",
  };
}
