import {
  type CapacityAnalysis,
  type CapacityThreshold,
  type OrderbookSnapshot,
  type PoolReserves,
  type VenueSnapshot,
} from "./schema";
import { parseDecimalToBigInt, safeCompare } from "./amountMath";
import { isOrderbookCrossed } from "./depthCurve";

const DEFAULT_THRESHOLDS = [1.0, 2.0, 5.0, 10.0];

/**
 * Calculates trade capacity for an order-book venue at standard price-impact thresholds.
 */
export function calculateOrderbookCapacity(
  orderbook: OrderbookSnapshot,
  side: "buy" | "sell",
  feeBps: number,
  benchmarkMidPrice: number,
  thresholds = DEFAULT_THRESHOLDS,
): CapacityAnalysis {
  if (isOrderbookCrossed(orderbook)) {
    return {
      thresholds: thresholds.map((t) => ({
        maxImpactPercent: t,
        maxBaseCapacity: "0",
        maxQuoteCapacity: "0",
        feeAdjustedQuote: "0",
        isLimitedByBookDepth: true,
      })),
      maxObservedDepthBase: "0",
      maxObservedDepthQuote: "0",
      hasInsufficientDepth: true,
      summary: "Cannot compute capacity on crossed order book",
    };
  }

  const levels = side === "buy"
    ? [...orderbook.asks].sort((a, b) => safeCompare(a.price, b.price))
    : [...orderbook.bids].sort((a, b) => safeCompare(b.price, a.price));

  let totalVisibleBase = 0;
  let totalVisibleQuote = 0;
  for (const lvl of levels) {
    const amt = Number.parseFloat(lvl.amount);
    const prc = Number.parseFloat(lvl.price);
    if (amt > 0 && prc > 0) {
      totalVisibleBase += amt;
      totalVisibleQuote += amt * prc;
    }
  }

  if (totalVisibleBase === 0 || benchmarkMidPrice <= 0) {
    return {
      thresholds: thresholds.map((t) => ({
        maxImpactPercent: t,
        maxBaseCapacity: "0",
        maxQuoteCapacity: "0",
        feeAdjustedQuote: "0",
        isLimitedByBookDepth: true,
      })),
      maxObservedDepthBase: "0",
      maxObservedDepthQuote: "0",
      hasInsufficientDepth: true,
      summary: "No depth observed in order book",
    };
  }

  const computedThresholds: CapacityThreshold[] = [];
  let anyLimited = false;

  for (const t of thresholds) {
    const tRatio = t / 100;
    const targetAvgPrice = side === "buy"
      ? benchmarkMidPrice * (1 + tRatio)
      : benchmarkMidPrice * (1 - tRatio);

    let baseAccum = 0;
    let quoteAccum = 0;
    let capacityBase = 0;
    let capacityQuote = 0;
    let reachedLimit = false;

    for (const lvl of levels) {
      const lvlAmt = Number.parseFloat(lvl.amount);
      const lvlPrice = Number.parseFloat(lvl.price);
      if (lvlAmt <= 0 || lvlPrice <= 0) continue;

      const nextBase = baseAccum + lvlAmt;
      const nextQuote = quoteAccum + lvlAmt * lvlPrice;
      const nextAvgPrice = nextQuote / nextBase;

      const crossedThreshold = side === "buy"
        ? nextAvgPrice > targetAvgPrice
        : nextAvgPrice < targetAvgPrice;

      if (crossedThreshold) {
        let deltaBase = 0;
        if (side === "buy") {
          if (lvlPrice > targetAvgPrice) {
            deltaBase = (targetAvgPrice * baseAccum - quoteAccum) / (lvlPrice - targetAvgPrice);
          }
        } else {
          if (targetAvgPrice > lvlPrice) {
            deltaBase = (quoteAccum - targetAvgPrice * baseAccum) / (targetAvgPrice - lvlPrice);
          }
        }
        deltaBase = Math.max(0, Math.min(lvlAmt, deltaBase));
        capacityBase = baseAccum + deltaBase;
        capacityQuote = quoteAccum + deltaBase * lvlPrice;
        reachedLimit = true;
        break;
      }

      baseAccum = nextBase;
      quoteAccum = nextQuote;
    }

    if (!reachedLimit) {
      capacityBase = baseAccum;
      capacityQuote = quoteAccum;
      anyLimited = true;
    }

    const feeQuote = capacityQuote * (feeBps / 10000);
    const feeAdjustedQuote = side === "buy"
      ? capacityQuote + feeQuote
      : Math.max(0, capacityQuote - feeQuote);

    computedThresholds.push({
      maxImpactPercent: t,
      maxBaseCapacity: capacityBase.toFixed(4),
      maxQuoteCapacity: capacityQuote.toFixed(4),
      feeAdjustedQuote: feeAdjustedQuote.toFixed(4),
      isLimitedByBookDepth: !reachedLimit,
    });
  }

  const firstThreshold = computedThresholds[0];
  const lastThreshold = computedThresholds[computedThresholds.length - 1];
  const summary = `Order-book capacity: ${firstThreshold.maxBaseCapacity} at 1% impact, ${lastThreshold.maxBaseCapacity} at 10% impact (Total depth: ${totalVisibleBase.toFixed(2)} base).`;

  return {
    thresholds: computedThresholds,
    maxObservedDepthBase: totalVisibleBase.toFixed(4),
    maxObservedDepthQuote: totalVisibleQuote.toFixed(4),
    hasInsufficientDepth: anyLimited,
    summary,
  };
}

/**
 * Calculates trade capacity for a constant-product pool at standard price-impact thresholds.
 */
export function calculateConstantProductCapacity(
  reserves: PoolReserves,
  side: "buy" | "sell",
  feeBps: number,
  thresholds: number[] = DEFAULT_THRESHOLDS,
): CapacityAnalysis {
  const baseReserveBig = reserves.baseReserve.includes(".")
    ? parseDecimalToBigInt(reserves.baseReserve, reserves.baseDecimals)
    : BigInt(reserves.baseReserve);
  const quoteReserveBig = reserves.quoteReserve.includes(".")
    ? parseDecimalToBigInt(reserves.quoteReserve, reserves.quoteDecimals)
    : BigInt(reserves.quoteReserve);

  if (baseReserveBig <= 0n || quoteReserveBig <= 0n) {
    return {
      thresholds: thresholds.map((t) => ({
        maxImpactPercent: t,
        maxBaseCapacity: "0",
        maxQuoteCapacity: "0",
        feeAdjustedQuote: "0",
        isLimitedByBookDepth: true,
      })),
      maxObservedDepthBase: "0",
      maxObservedDepthQuote: "0",
      hasInsufficientDepth: true,
      summary: "Pool has zero reserves",
    };
  }

  const baseReserveNum = Number(baseReserveBig) / 10 ** reserves.baseDecimals;
  const quoteReserveNum = Number(quoteReserveBig) / 10 ** reserves.quoteDecimals;

  const f = feeBps / 10000;
  const oneMinusF = 1 - f;

  const computedThresholds: CapacityThreshold[] = [];

  for (const t of thresholds) {
    const tRatio = t / 100;
    let baseCapacity = 0;
    let quoteCapacity = 0;

    if (side === "sell") {
      if (tRatio > f && oneMinusF > 0 && 1 - tRatio > 0) {
        baseCapacity = (baseReserveNum * (tRatio - f)) / (oneMinusF * (1 - tRatio));
        const deltaBaseFee = baseCapacity * oneMinusF;
        quoteCapacity = (quoteReserveNum * deltaBaseFee) / (baseReserveNum + deltaBaseFee);
      }
    } else {
      const numerator = tRatio * oneMinusF - f;
      if (numerator > 0 && oneMinusF > 0) {
        baseCapacity = (baseReserveNum * numerator) / (oneMinusF * (1 + tRatio));
        baseCapacity = Math.min(baseCapacity, baseReserveNum * 0.999);
        quoteCapacity = (quoteReserveNum * baseCapacity) / ((baseReserveNum - baseCapacity) * oneMinusF);
      }
    }

    computedThresholds.push({
      maxImpactPercent: t,
      maxBaseCapacity: baseCapacity > 0 ? baseCapacity.toFixed(4) : "0.0000",
      maxQuoteCapacity: quoteCapacity > 0 ? quoteCapacity.toFixed(4) : "0.0000",
      feeAdjustedQuote: quoteCapacity > 0 ? quoteCapacity.toFixed(4) : "0.0000",
      isLimitedByBookDepth: false,
    });
  }

  const firstThreshold = computedThresholds[0];
  const lastThreshold = computedThresholds[computedThresholds.length - 1];
  const summary = `Constant-product capacity: ${firstThreshold.maxBaseCapacity} at 1% impact, ${lastThreshold.maxBaseCapacity} at 10% impact (Reserves: ${baseReserveNum.toFixed(2)} base).`;

  return {
    thresholds: computedThresholds,
    maxObservedDepthBase: baseReserveNum.toFixed(4),
    maxObservedDepthQuote: quoteReserveNum.toFixed(4),
    hasInsufficientDepth: false,
    summary,
  };
}

/**
 * Calculates trade capacity for any venue snapshot.
 */
export function calculateCapacity(
  venue: VenueSnapshot,
  side: "buy" | "sell",
  benchmarkMidPrice: number,
  thresholds = DEFAULT_THRESHOLDS,
): CapacityAnalysis {
  if (venue.modelType === "orderbook" && venue.orderbook) {
    return calculateOrderbookCapacity(
      venue.orderbook,
      side,
      venue.feeBps,
      benchmarkMidPrice,
      thresholds,
    );
  }

  if (venue.modelType === "constant_product" && venue.poolReserves) {
    return calculateConstantProductCapacity(venue.poolReserves, side, venue.feeBps, thresholds);
  }

  return {
    thresholds: thresholds.map((t) => ({
      maxImpactPercent: t,
      maxBaseCapacity: "0",
      maxQuoteCapacity: "0",
      feeAdjustedQuote: "0",
      isLimitedByBookDepth: true,
    })),
    maxObservedDepthBase: "0",
    maxObservedDepthQuote: "0",
    hasInsufficientDepth: true,
    summary: venue.unsupportedReason || "Unsupported pool model",
  };
}
