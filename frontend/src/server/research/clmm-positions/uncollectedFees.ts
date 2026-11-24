import { Q128 } from "./tickMath";

export type TickFeeData = {
  feeGrowthOutside0X128: bigint;
  feeGrowthOutside1X128: bigint;
};

export type FeeInput = {
  tickCurrent: number;
  tickLower: number;
  tickUpper: number;
  liquidity: bigint;
  feeGrowthGlobal0X128: bigint;
  feeGrowthGlobal1X128: bigint;
  tickLowerData: TickFeeData;
  tickUpperData: TickFeeData;
  feeGrowthInside0LastX128: bigint;
  feeGrowthInside1LastX128: bigint;
  tokensOwed0: bigint;
  tokensOwed1: bigint;
};

export type FeeResult = {
  token0: bigint;
  token1: bigint;
};

/**
 * Uncollected fees for a Uniswap v3 position using feeGrowthInside math.
 * fee = (feeGrowthInside - feeGrowthInsideLast) * liquidity / 2^128 + tokensOwed
 */
export function uncollectedFees(input: FeeInput): FeeResult {
  if (input.liquidity === 0n) {
    return { token0: input.tokensOwed0, token1: input.tokensOwed1 };
  }

  const inside0 = feeGrowthInside(
    input.tickCurrent,
    input.tickLower,
    input.tickUpper,
    input.feeGrowthGlobal0X128,
    input.tickLowerData.feeGrowthOutside0X128,
    input.tickUpperData.feeGrowthOutside0X128,
  );
  const inside1 = feeGrowthInside(
    input.tickCurrent,
    input.tickLower,
    input.tickUpper,
    input.feeGrowthGlobal1X128,
    input.tickLowerData.feeGrowthOutside1X128,
    input.tickUpperData.feeGrowthOutside1X128,
  );

  const delta0 = subGrowth(inside0, input.feeGrowthInside0LastX128);
  const delta1 = subGrowth(inside1, input.feeGrowthInside1LastX128);

  return {
    token0: (delta0 * input.liquidity) / Q128 + input.tokensOwed0,
    token1: (delta1 * input.liquidity) / Q128 + input.tokensOwed1,
  };
}

export function feeGrowthInside(
  tickCurrent: number,
  tickLower: number,
  tickUpper: number,
  feeGrowthGlobalX128: bigint,
  feeGrowthOutsideLowerX128: bigint,
  feeGrowthOutsideUpperX128: bigint,
): bigint {
  const feeGrowthBelow =
    tickCurrent >= tickLower
      ? feeGrowthOutsideLowerX128
      : subGrowth(feeGrowthGlobalX128, feeGrowthOutsideLowerX128);

  const feeGrowthAbove =
    tickCurrent < tickUpper
      ? feeGrowthOutsideUpperX128
      : subGrowth(feeGrowthGlobalX128, feeGrowthOutsideUpperX128);

  return subGrowth(subGrowth(feeGrowthGlobalX128, feeGrowthBelow), feeGrowthAbove);
}

function subGrowth(a: bigint, b: bigint): bigint {
  // Uniswap fee growth is uint256 modular arithmetic
  const MOD = 2n ** 256n;
  return (a - b + MOD) % MOD;
}
