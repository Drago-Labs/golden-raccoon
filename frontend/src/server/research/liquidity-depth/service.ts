/**
 * Public entry point for the liquidity depth workbench.
 *
 * `analyseLiquidity` is pure and informational. It never creates an executable
 * quote, never selects a route, and never prepares a transaction — there is no
 * code path here that produces anything a signer could act on.
 */
import { parseAmount } from "./amountMath";
import {
  bestVisiblePrice,
  orderBookAssumptions,
  poolAssumptions,
  qualifications,
  visibleDepth,
} from "./capacity";
import { buildCoverage } from "./coverage";
import { orderBookCurve, poolCurve } from "./depthCurve";
import { adaptOrderBook, takerSide } from "./orderbookAdapter";
import { adaptPool, poolSpotPrice } from "./poolAdapter";
import { notModelled, walkOrderBook, walkPool } from "./priceImpact";
import {
  LIQUIDITY_LIMITS,
  LIQUIDITY_SCHEMA_VERSION,
  LiquidityError,
  liquidityRequestSchema,
  type AssetIdentity,
  type AssetInput,
  type LiquidityReport,
  type VenueAnalysis,
  type VenueInput,
  type VenueSnapshot,
} from "./schema";

function assetIdentity(asset: AssetInput): AssetIdentity {
  const chainId = asset.chainId.trim();
  const family = chainId.toLowerCase().startsWith("stellar") ? "stellar" : "evm";
  const discriminator =
    asset.issuer?.trim() ||
    asset.contractAddress?.trim().toLowerCase() ||
    asset.symbol.trim().toUpperCase();

  return {
    chainId,
    family,
    symbol: asset.symbol.trim(),
    decimals: asset.decimals,
    issuer: asset.issuer?.trim(),
    contractAddress: asset.contractAddress?.trim(),
    identityKey: `${chainId}|${asset.symbol.trim().toUpperCase()}|${discriminator}`,
  };
}

function describeVenue(venue: VenueInput): VenueSnapshot {
  return {
    venueId: venue.venueId,
    label: venue.label,
    model: venue.model,
    base: assetIdentity(venue.base),
    quote: assetIdentity(venue.quote),
    observedAt: venue.observedAt,
    ledgerOrBlock: venue.ledgerOrBlock ?? null,
    feeBps: venue.feeBps,
    truncated: venue.truncated,
    note:
      venue.model === "orderbook"
        ? "Depth read from observed order-book levels."
        : venue.model === "constant_product"
          ? "Depth modelled from constant-product reserves."
          : "Model not implemented by this workbench.",
  };
}

function analyseVenue(venue: VenueInput, ladder: bigint[], side: "buy_base" | "sell_base", nowMs: number): VenueAnalysis {
  const snapshot = describeVenue(venue);
  const reasons = qualifications(snapshot, nowMs, LIQUIDITY_LIMITS.staleAfterSeconds);

  if (venue.model === "unsupported_model") {
    return {
      venue: snapshot,
      bestPrice: null,
      visibleBaseDepth: "0",
      levels: [],
      ladder: notModelled(ladder, venue.feeBps, venue.model),
      assumptions: ["No calculation is performed for a model this workbench does not implement."],
      qualifications: [...reasons, "This venue's mechanics are not implemented, so no depth is claimed for it."],
      state: "unavailable",
    };
  }

  try {
    if (venue.model === "orderbook") {
      const book = adaptOrderBook(venue);
      const levels = takerSide(book, side);

      return {
        venue: snapshot,
        bestPrice: bestVisiblePrice(levels),
        visibleBaseDepth: visibleDepth(levels).toString(),
        levels: orderBookCurve(levels, venue.base.decimals, venue.quote.decimals),
        ladder: walkOrderBook(levels, ladder, side, venue.feeBps, venue.base.decimals, venue.quote.decimals),
        assumptions: orderBookAssumptions(snapshot),
        qualifications: reasons,
        state: levels.length === 0 ? "unavailable" : reasons.length > 0 ? "partial" : "complete",
      };
    }

    const pool = adaptPool(venue);
    const spot = poolSpotPrice(pool, venue.base.decimals, venue.quote.decimals);

    return {
      venue: snapshot,
      bestPrice: bestVisiblePrice([{ scaledPrice: spot, baseAmount: 1n }]),
      visibleBaseDepth: pool.baseReserve.toString(),
      levels: poolCurve(pool, ladder, side, venue.feeBps, venue.base.decimals, venue.quote.decimals),
      ladder: walkPool(pool, ladder, side, venue.feeBps, venue.base.decimals, venue.quote.decimals, spot),
      assumptions: poolAssumptions(snapshot),
      qualifications: reasons,
      state: reasons.length > 0 ? "partial" : "complete",
    };
  } catch (error) {
    if (error instanceof LiquidityError) {
      return {
        venue: snapshot,
        bestPrice: null,
        visibleBaseDepth: "0",
        levels: [],
        ladder: notModelled(ladder, venue.feeBps, venue.model),
        assumptions: [],
        qualifications: [...reasons, error.message],
        state: "unavailable",
      };
    }

    throw error;
  }
}

export function analyseLiquidity(input: unknown): LiquidityReport {
  const parsed = liquidityRequestSchema.safeParse(input);

  if (!parsed.success) {
    throw new LiquidityError("invalid_request", "The liquidity request could not be read.", parsed.error.flatten());
  }

  const request = parsed.data;
  const nowMs = request.now ? Date.parse(request.now) : Date.now();

  let ladder: bigint[];

  try {
    ladder = request.ladder.map(parseAmount);
  } catch (error) {
    throw new LiquidityError("invalid_ladder", error instanceof Error ? error.message : "The size ladder could not be read.");
  }

  // A ladder that is not ascending would make the "insufficient depth" boundary
  // meaningless, since a later rung could be smaller than an earlier one.
  for (let index = 1; index < ladder.length; index += 1) {
    if (ladder[index] <= ladder[index - 1]) {
      throw new LiquidityError("unsorted_ladder", "Size ladder entries must be strictly ascending.");
    }
  }

  const venues = request.venues.map((venue) => analyseVenue(venue, ladder, request.side, nowMs));

  return {
    schemaVersion: LIQUIDITY_SCHEMA_VERSION,
    requestedAt: new Date(nowMs).toISOString(),
    venues,
    coverage: buildCoverage(venues),
    informationalOnly: true,
  };
}

export { LiquidityError } from "./schema";
export type { LiquidityReport } from "./schema";
