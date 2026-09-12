import {
  type OrderbookSnapshot,
  type PoolReserves,
  type SizeLadderStep,
  type VenueSnapshot,
} from "./schema";
import {
  parseDecimalToBigInt,
  safeCompare,
} from "./amountMath";
import { isOrderbookCrossed } from "./depthCurve";

/**
 * Calculates a single size ladder step for an order-book venue.
 */
export function calculateOrderbookStep(
  orderbook: OrderbookSnapshot,
  size: string,
  tradeSide: "buy" | "sell",
  feeBps: number,
  benchmarkMidPrice: number,
): SizeLadderStep {
  if (isOrderbookCrossed(orderbook)) {
    return {
      size,
      tradeSide,
      marginalPrice: "0",
      averageExecutionPrice: "0",
      priceImpactPercent: 0,
      feeAmount: "0",
      netOutputAmount: "0",
      executable: false,
      insufficientDepth: true,
      warning: "Crossed order book detected: bid price exceeds or equals ask price",
    };
  }

  const levels = tradeSide === "buy"
    ? [...orderbook.asks].sort((a, b) => safeCompare(a.price, b.price))
    : [...orderbook.bids].sort((a, b) => safeCompare(b.price, a.price));

  const targetSizeNum = Number.parseFloat(size);
  if (!Number.isFinite(targetSizeNum) || targetSizeNum <= 0) {
    return {
      size,
      tradeSide,
      marginalPrice: "0",
      averageExecutionPrice: "0",
      priceImpactPercent: 0,
      feeAmount: "0",
      netOutputAmount: "0",
      executable: false,
      insufficientDepth: false,
      warning: "Invalid target trade size",
    };
  }

  let remainingBase = targetSizeNum;
  let totalQuote = 0;
  let totalBaseFilled = 0;
  let lastMarginalPrice = "0";

  for (const level of levels) {
    const levelAmount = Number.parseFloat(level.amount);
    const levelPrice = Number.parseFloat(level.price);

    if (levelAmount <= 0 || levelPrice <= 0) continue;

    const fillAmount = Math.min(remainingBase, levelAmount);
    totalQuote += fillAmount * levelPrice;
    totalBaseFilled += fillAmount;
    remainingBase -= fillAmount;
    lastMarginalPrice = level.price;

    if (remainingBase <= 1e-9) {
      break;
    }
  }

  const insufficientDepth = remainingBase > 1e-9;
  const executable = !insufficientDepth && totalBaseFilled > 0;

  if (totalBaseFilled === 0) {
    return {
      size,
      tradeSide,
      marginalPrice: "0",
      averageExecutionPrice: "0",
      priceImpactPercent: 0,
      feeAmount: "0",
      netOutputAmount: "0",
      executable: false,
      insufficientDepth: true,
      warning: "No order-book liquidity available for requested side",
    };
  }

  const averagePriceNum = totalQuote / totalBaseFilled;
  const benchmark = benchmarkMidPrice > 0 ? benchmarkMidPrice : averagePriceNum;
  const impactPercent = Math.abs((averagePriceNum - benchmark) / benchmark) * 100;
  const roundedImpact = Math.round(impactPercent * 10000) / 10000;

  const feeQuote = totalQuote * (feeBps / 10000);
  const netOutput = tradeSide === "buy"
    ? (totalQuote + feeQuote).toFixed(6)
    : Math.max(0, totalQuote - feeQuote).toFixed(6);

  return {
    size,
    tradeSide,
    marginalPrice: lastMarginalPrice,
    averageExecutionPrice: averagePriceNum.toFixed(6),
    priceImpactPercent: roundedImpact,
    feeAmount: feeQuote.toFixed(6),
    netOutputAmount: netOutput,
    executable,
    insufficientDepth,
    warning: insufficientDepth ? "Insufficient liquidity depth: trade size exceeds available order-book depth" : undefined,
  };
}

/**
 * Calculates a single size ladder step for a constant-product (x*y=k) pool.
 */
export function calculateConstantProductStep(
  reserves: PoolReserves,
  size: string,
  tradeSide: "buy" | "sell",
  feeBps: number = 30,
  benchmarkMidPrice: number = 0,
): SizeLadderStep {
  const baseReserveBig = reserves.baseReserve.includes(".")
    ? parseDecimalToBigInt(reserves.baseReserve, reserves.baseDecimals)
    : BigInt(reserves.baseReserve);
  const quoteReserveBig = reserves.quoteReserve.includes(".")
    ? parseDecimalToBigInt(reserves.quoteReserve, reserves.quoteDecimals)
    : BigInt(reserves.quoteReserve);

  if (baseReserveBig <= 0n || quoteReserveBig <= 0n) {
    return {
      size,
      tradeSide,
      marginalPrice: "0",
      averageExecutionPrice: "0",
      priceImpactPercent: 0,
      feeAmount: "0",
      netOutputAmount: "0",
      executable: false,
      insufficientDepth: true,
      warning: "Pool has zero reserves",
    };
  }

  const baseReserveNum = Number(baseReserveBig) / 10 ** reserves.baseDecimals;
  const quoteReserveNum = Number(quoteReserveBig) / 10 ** reserves.quoteDecimals;

  const targetSizeNum = Number.parseFloat(size);
  if (!Number.isFinite(targetSizeNum) || targetSizeNum <= 0) {
    return {
      size,
      tradeSide,
      marginalPrice: "0",
      averageExecutionPrice: "0",
      priceImpactPercent: 0,
      feeAmount: "0",
      netOutputAmount: "0",
      executable: false,
      insufficientDepth: false,
      warning: "Invalid target trade size",
    };
  }

  const spotPrice = benchmarkMidPrice > 0 ? benchmarkMidPrice : quoteReserveNum / baseReserveNum;
  const feeFactor = 1 - feeBps / 10000;

  if (tradeSide === "sell") {
    const deltaBase = targetSizeNum;
    const deltaBaseFee = deltaBase * feeFactor;
    const deltaQuote = (quoteReserveNum * deltaBaseFee) / (baseReserveNum + deltaBaseFee);

    const averagePrice = deltaQuote / deltaBase;
    const impactPercent = Math.abs((spotPrice - averagePrice) / spotPrice) * 100;
    const roundedImpact = Math.round(impactPercent * 10000) / 10000;

    const zeroFeeQuote = (quoteReserveNum * deltaBase) / (baseReserveNum + deltaBase);
    const feeQuote = Math.max(0, zeroFeeQuote - deltaQuote);

    const postBase = baseReserveNum + deltaBase;
    const postQuote = quoteReserveNum - deltaQuote;
    const marginalPrice = (postQuote / postBase) * feeFactor;

    return {
      size,
      tradeSide,
      marginalPrice: marginalPrice.toFixed(6),
      averageExecutionPrice: averagePrice.toFixed(6),
      priceImpactPercent: roundedImpact,
      feeAmount: feeQuote.toFixed(6),
      netOutputAmount: deltaQuote.toFixed(6),
      executable: true,
      insufficientDepth: false,
    };
  }

  const deltaBase = targetSizeNum;
  if (deltaBase >= baseReserveNum) {
    return {
      size,
      tradeSide,
      marginalPrice: "0",
      averageExecutionPrice: "0",
      priceImpactPercent: 0,
      feeAmount: "0",
      netOutputAmount: "0",
      executable: false,
      insufficientDepth: true,
      warning: "Requested buy size exceeds available pool reserves",
    };
  }

  const deltaQuote = (quoteReserveNum * deltaBase) / ((baseReserveNum - deltaBase) * feeFactor);
  const averagePrice = deltaQuote / deltaBase;
  const impactPercent = Math.abs((averagePrice - spotPrice) / spotPrice) * 100;
  const roundedImpact = Math.round(impactPercent * 10000) / 10000;

  const zeroFeeQuote = (quoteReserveNum * deltaBase) / (baseReserveNum - deltaBase);
  const feeQuote = Math.max(0, deltaQuote - zeroFeeQuote);

  const postBase = baseReserveNum - deltaBase;
  const postQuote = quoteReserveNum + deltaQuote;
  const marginalPrice = (postQuote / postBase) / feeFactor;

  return {
    size,
    tradeSide,
    marginalPrice: marginalPrice.toFixed(6),
    averageExecutionPrice: averagePrice.toFixed(6),
    priceImpactPercent: roundedImpact,
    feeAmount: feeQuote.toFixed(6),
    netOutputAmount: deltaQuote.toFixed(6),
    executable: true,
    insufficientDepth: false,
  };
}

/**
 * Builds the full size ladder for a venue across a list of target trade sizes.
 */
export function buildSizeLadder(
  venue: VenueSnapshot,
  sizes: string[],
  tradeSide: "buy" | "sell",
  benchmarkMidPrice: number,
): SizeLadderStep[] {
  if (venue.modelType === "orderbook" && venue.orderbook) {
    return sizes.map((size) =>
      calculateOrderbookStep(venue.orderbook!, size, tradeSide, venue.feeBps, benchmarkMidPrice)
    );
  }

  if (venue.modelType === "constant_product" && venue.poolReserves) {
    return sizes.map((size) =>
      calculateConstantProductStep(venue.poolReserves!, size, tradeSide, venue.feeBps)
    );
  }

  return sizes.map((size) => ({
    size,
    tradeSide,
    marginalPrice: "0",
    averageExecutionPrice: "0",
    priceImpactPercent: 0,
    feeAmount: "0",
    netOutputAmount: "0",
    executable: false,
    insufficientDepth: true,
    warning: venue.unsupportedReason || "Unsupported pool model",
  }));
}
