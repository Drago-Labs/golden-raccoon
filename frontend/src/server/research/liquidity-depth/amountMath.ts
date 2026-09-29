/**
 * Decimal-safe arithmetic for venue amounts.
 *
 * Every amount in this feature is an integer count of base units held in a
 * `bigint`. Prices arrive as decimal strings and are converted to a scaled
 * integer, so no value ever passes through a binary float and a token with 18
 * decimals keeps every digit.
 */

/** Fixed scale used for price arithmetic. 10^18 covers every supported asset. */
export const PRICE_SCALE_DECIMALS = 18;
export const PRICE_SCALE = 10n ** BigInt(PRICE_SCALE_DECIMALS);
export const BPS_DENOMINATOR = 10_000n;

/** Parses a non-negative decimal string into a `PRICE_SCALE`-scaled bigint. */
export function parsePrice(value: string): bigint {
  const trimmed = value.trim();

  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new RangeError(`"${value}" is not a non-negative decimal.`);
  }

  const [whole, fraction = ""] = trimmed.split(".");

  if (fraction.length > PRICE_SCALE_DECIMALS) {
    // Truncate rather than round: a price is a bound, and rounding it up would
    // let the report claim depth at a price the venue never offered.
    return BigInt(whole) * PRICE_SCALE + BigInt(fraction.slice(0, PRICE_SCALE_DECIMALS).padEnd(PRICE_SCALE_DECIMALS, "0"));
  }

  return BigInt(whole) * PRICE_SCALE + BigInt(fraction.padEnd(PRICE_SCALE_DECIMALS, "0"));
}

/** Renders a `PRICE_SCALE`-scaled bigint back to a decimal string. */
export function formatPrice(value: bigint): string {
  const negative = value < 0n;
  const magnitude = negative ? -value : value;
  const whole = magnitude / PRICE_SCALE;
  const fraction = (magnitude % PRICE_SCALE).toString().padStart(PRICE_SCALE_DECIMALS, "0").replace(/0+$/, "");

  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

export function parseAmount(value: string): bigint {
  if (!/^\d+$/.test(value.trim())) {
    throw new RangeError(`"${value}" is not an integer base-unit amount.`);
  }
  return BigInt(value.trim());
}

/** One whole unit of an asset, in its own base units. */
export function wholeUnit(decimals: number): bigint {
  return 10n ** BigInt(decimals);
}

/**
 * Quote base units obtained for `baseAmount` at `scaledPrice`.
 *
 * `price` is quote-per-*whole*-base, so both assets' own scales enter:
 * `quote = base / 10^baseDecimals * price * 10^quoteDecimals`. Passing only one
 * asset's decimals silently returns whole quote units instead of base units.
 *
 * Division truncates, which under-reports rather than over-reports the
 * proceeds — the conservative direction for a capacity estimate.
 */
export function quoteForBase(
  baseAmount: bigint,
  scaledPrice: bigint,
  baseDecimals: number,
  quoteDecimals: number,
): bigint {
  return (baseAmount * scaledPrice * wholeUnit(quoteDecimals)) / (wholeUnit(baseDecimals) * PRICE_SCALE);
}

/** Base base-units obtainable for `quoteAmount` at `scaledPrice`. */
export function baseForQuote(
  quoteAmount: bigint,
  scaledPrice: bigint,
  baseDecimals: number,
  quoteDecimals: number,
): bigint {
  if (scaledPrice === 0n) return 0n;
  return (quoteAmount * wholeUnit(baseDecimals) * PRICE_SCALE) / (scaledPrice * wholeUnit(quoteDecimals));
}

/**
 * Effective price for a fill, scaled to `PRICE_SCALE`.
 *
 * Price is quote-whole-units per base-whole-unit, so both scales are divided
 * out before scaling back up.
 */
export function effectivePrice(
  baseAmount: bigint,
  quoteAmount: bigint,
  baseDecimals: number,
  quoteDecimals: number,
): bigint | null {
  if (baseAmount === 0n) return null;
  return (quoteAmount * wholeUnit(baseDecimals) * PRICE_SCALE) / (baseAmount * wholeUnit(quoteDecimals));
}

/** Applies a basis-point fee, truncating in the taker's disfavour. */
export function applyFeeBps(amount: bigint, feeBps: number): bigint {
  return (amount * (BPS_DENOMINATOR - BigInt(feeBps))) / BPS_DENOMINATOR;
}

/** Removes a basis-point fee from an input amount before it reaches a pool. */
export function netOfFeeBps(amount: bigint, feeBps: number): bigint {
  return (amount * (BPS_DENOMINATOR - BigInt(feeBps))) / BPS_DENOMINATOR;
}

/**
 * Signed basis-point difference between an effective and a reference price.
 * Positive means the taker did worse than the reference.
 */
export function priceImpactBps(effective: bigint, reference: bigint, side: "buy_base" | "sell_base"): number | null {
  if (reference === 0n) return null;

  const delta = side === "sell_base" ? reference - effective : effective - reference;

  return Number((delta * BPS_DENOMINATOR) / reference);
}
