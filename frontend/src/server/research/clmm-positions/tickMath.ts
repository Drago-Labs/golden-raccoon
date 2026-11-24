/** Uniswap v3 tick math (Q64.96 sqrt prices). */

export const MIN_TICK = -887272;
export const MAX_TICK = 887272;
export const Q96 = 2n ** 96n;
export const Q128 = 2n ** 128n;

/**
 * Returns the sqrt price as a Q64.96 for the given tick.
 * Ported from Uniswap v3 TickMath.getSqrtRatioAtTick.
 */
export function getSqrtRatioAtTick(tick: number): bigint {
  if (!Number.isInteger(tick) || tick < MIN_TICK || tick > MAX_TICK) {
    throw new Error(`Tick out of range: ${tick}`);
  }

  const absTick = tick < 0 ? -tick : tick;

  let ratio =
    (absTick & 0x1) !== 0
      ? 0xfffcb933bd6fad37aa2d162d1a594001n
      : 0x100000000000000000000000000000000n;

  if ((absTick & 0x2) !== 0) ratio = (ratio * 0xfff97272373d413259a46990580e213an) >> 128n;
  if ((absTick & 0x4) !== 0) ratio = (ratio * 0xfff2e50f5f656932ef12357cf3c7fdccn) >> 128n;
  if ((absTick & 0x8) !== 0) ratio = (ratio * 0xffe5caca7e10e4e61c3624eaa0941cd0n) >> 128n;
  if ((absTick & 0x10) !== 0) ratio = (ratio * 0xffcb9843d60f6159c9db58835c926644n) >> 128n;
  if ((absTick & 0x20) !== 0) ratio = (ratio * 0xff973b41fa98c081472e6896dfb254c0n) >> 128n;
  if ((absTick & 0x40) !== 0) ratio = (ratio * 0xff2ea16466c96a3843ec78b326b52861n) >> 128n;
  if ((absTick & 0x80) !== 0) ratio = (ratio * 0xfe5dee046a99a2a811c461f1969c3053n) >> 128n;
  if ((absTick & 0x100) !== 0) ratio = (ratio * 0xfcbe86c7900a88aedcffc83b479aa3a4n) >> 128n;
  if ((absTick & 0x200) !== 0) ratio = (ratio * 0xf987a7253ac413176f2b074cf7815e54n) >> 128n;
  if ((absTick & 0x400) !== 0) ratio = (ratio * 0xf3392b0822b70005940c7a398e4b70f3n) >> 128n;
  if ((absTick & 0x800) !== 0) ratio = (ratio * 0xe7159475a2bc299468654a6988ad0f77n) >> 128n;
  if ((absTick & 0x1000) !== 0) ratio = (ratio * 0xd097f3bdfd2022b8845ad8f792aa5825n) >> 128n;
  if ((absTick & 0x2000) !== 0) ratio = (ratio * 0xa9f746462d870fdf8a65dc1f90e061e5n) >> 128n;
  if ((absTick & 0x4000) !== 0) ratio = (ratio * 0x70d869a156d2a1b890bb3df62baf32f7n) >> 128n;
  if ((absTick & 0x8000) !== 0) ratio = (ratio * 0x31be135f97d08fd981231505542fcfa6n) >> 128n;
  if ((absTick & 0x10000) !== 0) ratio = (ratio * 0x9aa508b5b7a84e1c677de54f3e99bc9n) >> 128n;
  if ((absTick & 0x20000) !== 0) ratio = (ratio * 0x5d6af8dedb81196699c329225ee604n) >> 128n;
  if ((absTick & 0x40000) !== 0) ratio = (ratio * 0x2216e584f5fa1ea926041bedfe98n) >> 128n;
  if ((absTick & 0x80000) !== 0) ratio = (ratio * 0x48a170391f7dc42444e8fa2n) >> 128n;

  if (tick > 0) ratio = (2n ** 256n - 1n) / ratio;

  // Round up to keep consistency with Solidity
  return (ratio >> 32n) + (ratio % (1n << 32n) === 0n ? 0n : 1n);
}

/** Human-readable price of token1 per token0 (token1/token0), ignoring decimal adjustment. */
export function priceFromSqrtX96(sqrtPriceX96: bigint): string {
  // price = (sqrtPriceX96 / 2^96)^2
  const numerator = sqrtPriceX96 * sqrtPriceX96;
  const denominator = Q96 * Q96;
  return formatFixed(numerator, denominator, 18);
}

export function priceFromTick(tick: number): string {
  return priceFromSqrtX96(getSqrtRatioAtTick(tick));
}

/** Decimal-adjusted price of token1 per token0. */
export function adjustedPriceFromTick(
  tick: number,
  token0Decimals: number,
  token1Decimals: number,
): string {
  const raw = priceFromTick(tick);
  const scale = 10n ** BigInt(Math.abs(token0Decimals - token1Decimals));
  if (token0Decimals === token1Decimals) return raw;
  if (token0Decimals > token1Decimals) {
    return multiplyDecimal(raw, scale.toString());
  }
  return divideDecimal(raw, scale.toString());
}

function formatFixed(numerator: bigint, denominator: bigint, places: number): string {
  if (denominator === 0n) return "0";
  const whole = numerator / denominator;
  const rem = numerator % denominator;
  if (rem === 0n) return whole.toString();
  const scale = 10n ** BigInt(places);
  const frac = (rem * scale) / denominator;
  const fracStr = frac.toString().padStart(places, "0").replace(/0+$/, "");
  return fracStr.length === 0 ? whole.toString() : `${whole}.${fracStr}`;
}

function multiplyDecimal(value: string, factor: string): string {
  const [w = "0", f = ""] = value.split(".");
  const places = f.length;
  const asInt = BigInt(w + f.padEnd(places, "0").slice(0, places) || "0") * BigInt(factor);
  if (places === 0) return asInt.toString();
  const s = asInt.toString().padStart(places + 1, "0");
  const whole = s.slice(0, -places) || "0";
  const frac = s.slice(-places).replace(/0+$/, "");
  return frac.length === 0 ? whole : `${whole}.${frac}`;
}

function divideDecimal(value: string, divisor: string): string {
  const [w = "0", f = ""] = value.split(".");
  const places = Math.max(f.length, 18);
  const asInt = BigInt(w + f.padEnd(places, "0").slice(0, places) || "0");
  const q = asInt / BigInt(divisor);
  const s = q.toString().padStart(places + 1, "0");
  const whole = s.slice(0, -places) || "0";
  const frac = s.slice(-places).replace(/0+$/, "");
  return frac.length === 0 ? whole : `${whole}.${frac}`;
}

/** Percentage distance from current price to bound price: (bound - current) / current * 100. */
export function percentDistance(currentPrice: string, boundPrice: string): string {
  const cur = toScaled(currentPrice, 18);
  const bound = toScaled(boundPrice, 18);
  if (cur === 0n) return "0";
  const pct = ((bound - cur) * 10000n) / cur; // two decimal places of percent
  const neg = pct < 0n;
  const abs = neg ? -pct : pct;
  const whole = abs / 100n;
  const frac = (abs % 100n).toString().padStart(2, "0");
  return `${neg ? "-" : ""}${whole}.${frac}`;
}

function toScaled(value: string, places: number): bigint {
  const neg = value.startsWith("-");
  const raw = neg ? value.slice(1) : value;
  const [w = "0", f = ""] = raw.split(".");
  const scaled = BigInt(w + f.padEnd(places, "0").slice(0, places));
  return neg ? -scaled : scaled;
}
