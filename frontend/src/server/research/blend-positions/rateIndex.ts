import { BLEND_POSITION_LIMITS } from "./limits";

/**
 * Converts a b-token balance to underlying asset units using floor integer division:
 * underlyingSupply = floor((bTokens * bRate) / 10^9)
 */
export function convertBTokenToUnderlying(bTokensRaw: string, bRateRaw: string): bigint {
  const bTokens = BigInt(bTokensRaw);
  const bRate = BigInt(bRateRaw);
  if (bTokens <= 0n || bRate <= 0n) return 0n;
  return (bTokens * bRate) / BLEND_POSITION_LIMITS.rateScalar;
}

/**
 * Converts a d-token balance to underlying debt units using ceiling integer division:
 * underlyingBorrow = ceil((dTokens * dRate) / 10^9)
 */
export function convertDTokenToUnderlying(dTokensRaw: string, dRateRaw: string): bigint {
  const dTokens = BigInt(dTokensRaw);
  const dRate = BigInt(dRateRaw);
  if (dTokens <= 0n || dRate <= 0n) return 0n;
  const scalar = BLEND_POSITION_LIMITS.rateScalar;
  return (dTokens * dRate + scalar - 1n) / scalar;
}

export function formatTokenUnits(rawAmount: bigint, decimals: number): string {
  const scale = 10n ** BigInt(decimals);
  const whole = rawAmount / scale;
  const frac = rawAmount % scale;
  if (frac === 0n) return `${whole}.0`;
  const padded = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${whole}.${padded}`;
}

export function toDecimalNumber(rawAmount: bigint, decimals: number): number {
  return Number(rawAmount) / 10 ** decimals;
}
