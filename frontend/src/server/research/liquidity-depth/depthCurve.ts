/**
 * Depth curves for both venue models.
 *
 * The order-book curve is the observed book, nothing more: cumulative depth
 * stops where the levels stop. The pool curve is analytical, derived from the
 * reserves and the fee, and is explicitly labelled as such — a model, not an
 * observation.
 */
import { effectivePrice, formatPrice, quoteForBase } from "./amountMath";
import type { NormalizedLevel } from "./orderbookAdapter";
import type { NormalizedPool } from "./poolAdapter";
import type { DepthLevel } from "./schema";

/** Cumulative depth over the observed levels a taker would consume. */
export function orderBookCurve(levels: NormalizedLevel[], baseDecimals: number, quoteDecimals: number): DepthLevel[] {
  let cumulativeBase = 0n;
  let cumulativeQuote = 0n;

  return levels.map((level) => {
    cumulativeBase += level.baseAmount;
    cumulativeQuote += quoteForBase(level.baseAmount, level.scaledPrice, baseDecimals, quoteDecimals);

    return {
      price: formatPrice(level.scaledPrice),
      baseAmount: level.baseAmount.toString(),
      cumulativeBaseAmount: cumulativeBase.toString(),
      cumulativeQuoteAmount: cumulativeQuote.toString(),
    };
  });
}

/**
 * Samples the constant-product curve at each ladder size.
 *
 * The rungs are sample points on a continuous curve, not discrete resting
 * orders, which is why the returned `price` is the *average* price for a trade
 * of that size rather than a marginal price at a level.
 */
export function poolCurve(
  pool: NormalizedPool,
  ladder: bigint[],
  side: "buy_base" | "sell_base",
  feeBps: number,
  baseDecimals: number,
  quoteDecimals: number,
): DepthLevel[] {
  return ladder.map((size) => {
    const output = poolOutputFor(pool, size, side, feeBps);
    const average = output === null ? null : effectivePrice(size, output, baseDecimals, quoteDecimals);

    return {
      price: average === null ? "0" : formatPrice(average),
      baseAmount: size.toString(),
      cumulativeBaseAmount: size.toString(),
      cumulativeQuoteAmount: (output ?? 0n).toString(),
    };
  });
}

/**
 * Constant-product output for a trade of `baseAmount`.
 *
 * For `sell_base` the taker pays base and receives quote; the fee is taken on
 * the input, which is how Uniswap-style pools charge it. For `buy_base` the
 * required quote input is solved from the same invariant and the fee is grossed
 * back up onto the input.
 *
 * Returns `null` when the pool cannot serve the size at all — for `buy_base`,
 * any size at or beyond the base reserve, since the curve is asymptotic there.
 */
export function poolOutputFor(
  pool: NormalizedPool,
  baseAmount: bigint,
  side: "buy_base" | "sell_base",
  feeBps: number,
): bigint | null {
  if (baseAmount <= 0n) return 0n;

  const feeNumerator = 10_000n - BigInt(feeBps);

  if (side === "sell_base") {
    // dy = (y * dx_net) / (x + dx_net), with dx_net = dx * (1 - fee).
    const inputNet = (baseAmount * feeNumerator) / 10_000n;
    return (pool.quoteReserve * inputNet) / (pool.baseReserve + inputNet);
  }

  // Buying base out of the pool: the pool can never release its whole base
  // reserve, so any size at or beyond it is unreachable rather than expensive.
  if (baseAmount >= pool.baseReserve) return null;

  // dx_in = (x_quote * dy) / (y_base - dy), then gross up for the fee.
  const required = (pool.quoteReserve * baseAmount) / (pool.baseReserve - baseAmount);
  return (required * 10_000n) / feeNumerator;
}
