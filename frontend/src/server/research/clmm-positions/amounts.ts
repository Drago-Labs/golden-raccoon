import { getSqrtRatioAtTick, Q96 } from "./tickMath";

export type AmountResult = {
  amount0: bigint;
  amount1: bigint;
};

/**
 * Token amounts for a concentrated-liquidity position given current sqrt price and liquidity.
 * Matches Uniswap v3 LiquidityAmounts.getAmountsForLiquidity.
 */
export function amountsForLiquidity(
  sqrtRatioX96: bigint,
  sqrtRatioAX96: bigint,
  sqrtRatioBX96: bigint,
  liquidity: bigint,
): AmountResult {
  let lower = sqrtRatioAX96;
  let upper = sqrtRatioBX96;
  if (lower > upper) {
    const tmp = lower;
    lower = upper;
    upper = tmp;
  }

  if (liquidity === 0n) {
    return { amount0: 0n, amount1: 0n };
  }

  if (sqrtRatioX96 <= lower) {
    return {
      amount0: amount0ForLiquidity(lower, upper, liquidity),
      amount1: 0n,
    };
  }

  if (sqrtRatioX96 < upper) {
    return {
      amount0: amount0ForLiquidity(sqrtRatioX96, upper, liquidity),
      amount1: amount1ForLiquidity(lower, sqrtRatioX96, liquidity),
    };
  }

  return {
    amount0: 0n,
    amount1: amount1ForLiquidity(lower, upper, liquidity),
  };
}

export function amountsForPosition(input: {
  tickCurrent: number;
  tickLower: number;
  tickUpper: number;
  liquidity: bigint;
  sqrtPriceX96?: bigint;
}): AmountResult {
  const sqrtPriceX96 = input.sqrtPriceX96 ?? getSqrtRatioAtTick(input.tickCurrent);
  return amountsForLiquidity(
    sqrtPriceX96,
    getSqrtRatioAtTick(input.tickLower),
    getSqrtRatioAtTick(input.tickUpper),
    input.liquidity,
  );
}

export function formatTokenAmount(raw: bigint, decimals: number): string {
  if (raw === 0n) return "0";
  const neg = raw < 0n;
  const value = neg ? -raw : raw;
  const base = 10n ** BigInt(decimals);
  const whole = value / base;
  const frac = value % base;
  if (frac === 0n) return `${neg ? "-" : ""}${whole}`;
  const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${whole}.${fracStr}`;
}

function amount0ForLiquidity(sqrtRatioAX96: bigint, sqrtRatioBX96: bigint, liquidity: bigint): bigint {
  let lower = sqrtRatioAX96;
  let upper = sqrtRatioBX96;
  if (lower > upper) {
    const tmp = lower;
    lower = upper;
    upper = tmp;
  }
  // L * (sqrtUpper - sqrtLower) / (sqrtUpper * sqrtLower) * Q96
  return (liquidity * Q96 * (upper - lower)) / upper / lower;
}

function amount1ForLiquidity(sqrtRatioAX96: bigint, sqrtRatioBX96: bigint, liquidity: bigint): bigint {
  let lower = sqrtRatioAX96;
  let upper = sqrtRatioBX96;
  if (lower > upper) {
    const tmp = lower;
    lower = upper;
    upper = tmp;
  }
  // L * (sqrtUpper - sqrtLower) / Q96
  return (liquidity * (upper - lower)) / Q96;
}
