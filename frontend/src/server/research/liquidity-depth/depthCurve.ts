import {
  type CumulativeDepthPoint,
  type DepthCurve,
  type OrderbookSnapshot,
  type PoolReserves,
  type VenueSnapshot,
} from "./schema";
import {
  parseDecimalToBigInt,
  safeAdd,
  safeCompare,
  safeMul,
} from "./amountMath";

/**
 * Checks whether an order book is crossed (highest bid >= lowest ask).
 */
export function isOrderbookCrossed(orderbook: OrderbookSnapshot): boolean {
  if (orderbook.bids.length === 0 || orderbook.asks.length === 0) {
    return false;
  }
  const sortedBids = [...orderbook.bids].sort((a, b) => safeCompare(b.price, a.price));
  const sortedAsks = [...orderbook.asks].sort((a, b) => safeCompare(a.price, b.price));
  return safeCompare(sortedBids[0].price, sortedAsks[0].price) >= 0;
}

function computeDepthWithinPct(
  bids: CumulativeDepthPoint[],
  asks: CumulativeDepthPoint[],
  midPrice: number,
  pct: number,
): number {
  if (midPrice <= 0) return 0;
  const lowerBound = midPrice * (1 - pct / 100);
  const upperBound = midPrice * (1 + pct / 100);

  let bidBase = 0;
  for (const b of bids) {
    if (b.price >= lowerBound) {
      bidBase = Math.max(bidBase, b.cumulativeBase);
    }
  }

  let askBase = 0;
  for (const a of asks) {
    if (a.price <= upperBound) {
      askBase = Math.max(askBase, a.cumulativeBase);
    }
  }

  return bidBase + askBase;
}

/**
 * Constructs a cumulative depth curve from an order book snapshot.
 */
export function buildOrderbookDepthCurve(orderbook: OrderbookSnapshot): DepthCurve {
  const sortedBids = [...orderbook.bids].sort((a, b) => safeCompare(b.price, a.price));
  const sortedAsks = [...orderbook.asks].sort((a, b) => safeCompare(a.price, b.price));

  let cumBaseBid = "0";
  let cumQuoteBid = "0";
  const bids: CumulativeDepthPoint[] = [];

  for (const level of sortedBids) {
    cumBaseBid = safeAdd(cumBaseBid, level.amount);
    const levelQuote = safeMul(level.amount, level.price);
    cumQuoteBid = safeAdd(cumQuoteBid, levelQuote);
    bids.push({
      price: Number.parseFloat(level.price),
      cumulativeBase: Number.parseFloat(cumBaseBid),
      cumulativeQuote: Number.parseFloat(cumQuoteBid),
      depthType: "bid",
    });
  }

  let cumBaseAsk = "0";
  let cumQuoteAsk = "0";
  const asks: CumulativeDepthPoint[] = [];

  for (const level of sortedAsks) {
    cumBaseAsk = safeAdd(cumBaseAsk, level.amount);
    const levelQuote = safeMul(level.amount, level.price);
    cumQuoteAsk = safeAdd(cumQuoteAsk, levelQuote);
    asks.push({
      price: Number.parseFloat(level.price),
      cumulativeBase: Number.parseFloat(cumBaseAsk),
      cumulativeQuote: Number.parseFloat(cumQuoteAsk),
      depthType: "ask",
    });
  }

  let midPrice = 0;
  let spreadPercent: number | undefined;

  if (sortedBids.length > 0 && sortedAsks.length > 0) {
    const bestBidNum = Number.parseFloat(sortedBids[0].price);
    const bestAskNum = Number.parseFloat(sortedAsks[0].price);
    midPrice = (bestBidNum + bestAskNum) / 2;
    if (midPrice > 0) {
      spreadPercent = ((bestAskNum - bestBidNum) / midPrice) * 100;
    }
  } else if (sortedAsks.length > 0) {
    midPrice = Number.parseFloat(sortedAsks[0].price);
  } else if (sortedBids.length > 0) {
    midPrice = Number.parseFloat(sortedBids[0].price);
  }

  return {
    bids,
    asks,
    midPrice,
    spreadPercent,
    depthAt1Pct: computeDepthWithinPct(bids, asks, midPrice, 1.0),
    depthAt2Pct: computeDepthWithinPct(bids, asks, midPrice, 2.0),
    depthAt5Pct: computeDepthWithinPct(bids, asks, midPrice, 5.0),
    depthAt10Pct: computeDepthWithinPct(bids, asks, midPrice, 10.0),
  };
}

/**
 * Constructs an analytical cumulative depth curve for a constant-product (x*y=k) liquidity pool.
 */
export function buildConstantProductDepthCurve(
  reserves: PoolReserves,
  feeBps: number,
): DepthCurve {
  const baseReserveBig = reserves.baseReserve.includes(".")
    ? parseDecimalToBigInt(reserves.baseReserve, reserves.baseDecimals)
    : BigInt(reserves.baseReserve);
  const quoteReserveBig = reserves.quoteReserve.includes(".")
    ? parseDecimalToBigInt(reserves.quoteReserve, reserves.quoteDecimals)
    : BigInt(reserves.quoteReserve);

  if (baseReserveBig <= 0n || quoteReserveBig <= 0n) {
    return { bids: [], asks: [], midPrice: 0 };
  }

  const baseReserveNum = Number(baseReserveBig) / 10 ** reserves.baseDecimals;
  const quoteReserveNum = Number(quoteReserveBig) / 10 ** reserves.quoteDecimals;

  const midPrice = quoteReserveNum / baseReserveNum;
  const spreadPercent = (feeBps / 10000) * 100;

  const fractions = [0.005, 0.01, 0.02, 0.05, 0.08, 0.12, 0.18, 0.25, 0.35, 0.5];
  const feeFactor = 1 - feeBps / 10000;

  const bids: CumulativeDepthPoint[] = [];
  const asks: CumulativeDepthPoint[] = [];

  for (const fraction of fractions) {
    const deltaBase = baseReserveNum * fraction;

    const deltaBaseFee = deltaBase * feeFactor;
    const deltaQuoteReceived = (quoteReserveNum * deltaBaseFee) / (baseReserveNum + deltaBaseFee);
    const bidPrice = deltaQuoteReceived / deltaBase;

    bids.push({
      price: bidPrice,
      cumulativeBase: deltaBase,
      cumulativeQuote: deltaQuoteReceived,
      depthType: "pool_bid",
    });

    if (fraction < 0.95) {
      const deltaQuoteNeeded =
        (quoteReserveNum * deltaBase) / ((baseReserveNum - deltaBase) * feeFactor);
      const askPrice = deltaQuoteNeeded / deltaBase;

      asks.push({
        price: askPrice,
        cumulativeBase: deltaBase,
        cumulativeQuote: deltaQuoteNeeded,
        depthType: "pool_ask",
      });
    }
  }

  bids.sort((a, b) => b.price - a.price);
  asks.sort((a, b) => a.price - b.price);

  return {
    bids,
    asks,
    midPrice,
    spreadPercent,
    depthAt1Pct: computeDepthWithinPct(bids, asks, midPrice, 1.0),
    depthAt2Pct: computeDepthWithinPct(bids, asks, midPrice, 2.0),
    depthAt5Pct: computeDepthWithinPct(bids, asks, midPrice, 5.0),
    depthAt10Pct: computeDepthWithinPct(bids, asks, midPrice, 10.0),
  };
}

/**
 * Builds the depth curve for any supported venue snapshot.
 */
export function buildDepthCurve(venue: VenueSnapshot): DepthCurve {
  if (venue.modelType === "orderbook" && venue.orderbook) {
    return buildOrderbookDepthCurve(venue.orderbook);
  }
  if (venue.modelType === "constant_product" && venue.poolReserves) {
    return buildConstantProductDepthCurve(venue.poolReserves, venue.feeBps);
  }
  return { bids: [], asks: [], midPrice: 0 };
}
