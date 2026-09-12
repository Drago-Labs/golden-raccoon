import {
  type CoverageReport,
  type CoverageStatus,
  type VenueSnapshot,
} from "./schema";
import { parseDecimalToBigInt } from "./amountMath";
import { isOrderbookCrossed } from "./depthCurve";

const STALE_THRESHOLD_MS = 120_000;

/**
 * Evaluates snapshot health, boundaries, and qualification state for liquidity analysis.
 */
export function evaluateCoverage(
  venue: VenueSnapshot,
  ladderSizes?: string[],
): CoverageReport {
  const reasons: string[] = [];
  const modelAssumptions: string[] = [];
  let status: CoverageStatus = "complete";

  if (venue.modelType === "orderbook") {
    modelAssumptions.push(
      "Assumes static order book with zero execution latency and no cancel-replace race conditions.",
      "Assumes fills walk discrete limit levels in strict price-time priority.",
      "Never fabricates synthetic depth beyond explicitly observed book levels.",
    );
  } else if (venue.modelType === "constant_product") {
    modelAssumptions.push(
      "Assumes standard constant-product AMM formula (x * y = k) with uniform fee deduction.",
      "Assumes continuous liquidity without tick spacing, concentrated boundaries, or dynamic fee tiers.",
      "Does not account for external sandwich arbitrage, MEV reordering, or concurrent pool rebalancing.",
    );
  } else {
    modelAssumptions.push(
      "Venue model is not supported by the analytical depth engine.",
    );
  }

  const baseId = venue.baseAsset.addressOrCode.toLowerCase();
  const quoteId = venue.quoteAsset.addressOrCode.toLowerCase();
  const baseSymbol = venue.baseAsset.symbol.toUpperCase();
  const quoteSymbol = venue.quoteAsset.symbol.toUpperCase();

  if (baseId === quoteId || baseSymbol === quoteSymbol) {
    status = "unavailable";
    reasons.push("Wrong pair orientation: base and quote are the same asset");
    return {
      status,
      reasons,
      modelAssumptions,
      dataBoundaryNotice: "Invalid pair requested.",
      lastObservedAt: venue.timestamp,
      ledgerOrBlock: venue.ledgerOrBlock,
      isStale: false,
      isTruncated: false,
    };
  }

  if (venue.modelType === "unsupported") {
    status = "unsupported";
    reasons.push(venue.unsupportedReason || "Unsupported pool model");
    return {
      status,
      reasons,
      modelAssumptions,
      dataBoundaryNotice: "Analytical depth cannot be calculated for unsupported pool structures.",
      lastObservedAt: venue.timestamp,
      ledgerOrBlock: venue.ledgerOrBlock,
      isStale: false,
      isTruncated: false,
    };
  }

  if (venue.modelType === "constant_product") {
    if (!venue.poolReserves) {
      status = "empty";
      reasons.push("Zero reserves observed: pool reserves data missing");
    } else {
      const baseRes = venue.poolReserves.baseReserve.includes(".")
        ? parseDecimalToBigInt(venue.poolReserves.baseReserve, venue.poolReserves.baseDecimals)
        : BigInt(venue.poolReserves.baseReserve);
      const quoteRes = venue.poolReserves.quoteReserve.includes(".")
        ? parseDecimalToBigInt(venue.poolReserves.quoteReserve, venue.poolReserves.quoteDecimals)
        : BigInt(venue.poolReserves.quoteReserve);
      if (baseRes <= 0n || quoteRes <= 0n) {
        status = "empty";
        reasons.push("Zero reserves observed: base or quote pool reserve is zero");
      }
    }
  }

  if (venue.modelType === "orderbook") {
    if (!venue.orderbook) {
      status = "empty";
      reasons.push("Order book is empty: zero bids and zero asks observed");
    } else {
      if (isOrderbookCrossed(venue.orderbook)) {
        status = "partial";
        reasons.push("Crossed order book: best bid price is greater than or equal to best ask price");
      } else if (venue.orderbook.bids.length === 0 && venue.orderbook.asks.length === 0) {
        status = "empty";
        reasons.push("Order book is empty: zero bids and zero asks observed");
      } else if (venue.orderbook.bids.length === 0 || venue.orderbook.asks.length === 0) {
        status = "partial";
        reasons.push("Order book has liquidity on only one side");
      }
    }
  }

  const observationTime = new Date(venue.timestamp).getTime();
  const now = Date.now();
  const ageSeconds = Number.isFinite(observationTime)
    ? Math.max(0, Math.round((now - observationTime) / 1000))
    : 0;

  const isStale = Boolean(venue.isStale || (Number.isFinite(observationTime) && now - observationTime > STALE_THRESHOLD_MS));
  if (isStale) {
    if (status === "complete" || status === "partial") {
      status = "stale";
    }
    reasons.push(`Snapshot observation is stale (${ageSeconds}s old; exceeds 120s limit)`);
  }

  let isTruncated = Boolean(venue.isTruncated);
  if (isTruncated) {
    if (status === "complete") {
      status = "truncated";
    }
    reasons.push("Order book depth truncated at venue pagination boundary; depth beyond observed levels cannot be verified");
  } else if (venue.modelType === "orderbook" && venue.orderbook && ladderSizes) {
    let maxVisibleBase = 0;
    for (const lvl of [...venue.orderbook.asks, ...venue.orderbook.bids]) {
      maxVisibleBase += Number.parseFloat(lvl.amount) || 0;
    }
    const maxRequestedSize = Math.max(...ladderSizes.map((s) => Number.parseFloat(s) || 0));
    if (maxRequestedSize > maxVisibleBase && maxVisibleBase > 0) {
      if (status === "complete") {
        status = "truncated";
      }
      isTruncated = true;
      reasons.push(`Requested trade size (${maxRequestedSize}) exceeds total observed book depth (${maxVisibleBase.toFixed(2)})`);
    }
  }

  const dataBoundaryNotice = status === "complete"
    ? undefined
    : `Liquidity depth qualified as ${status.toUpperCase()}: ${reasons.join("; ")}`;

  return {
    status,
    reasons,
    modelAssumptions,
    dataBoundaryNotice,
    staleAgeSeconds: ageSeconds,
    lastObservedAt: venue.timestamp,
    ledgerOrBlock: venue.ledgerOrBlock,
    isStale,
    isTruncated,
  };
}
