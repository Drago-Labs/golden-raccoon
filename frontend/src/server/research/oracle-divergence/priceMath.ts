/**
 * Decimal-safe price arithmetic. Every price passes through a fixed-point
 * `bigint` scale rather than a binary float, so no comparison drifts because
 * of how many decimals a feed happens to report in.
 */
export const PRICE_SCALE_DECIMALS = 18;
export const PRICE_SCALE = 10n ** BigInt(PRICE_SCALE_DECIMALS);
export const BPS_DENOMINATOR = 10_000n;

/** Parses a non-negative decimal string (a market quote) into a `PRICE_SCALE`-scaled bigint. */
export function parseDecimalPrice(value: string): bigint {
  const trimmed = value.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) throw new RangeError(`"${value}" is not a non-negative decimal.`);
  const [whole, fraction = ""] = trimmed.split(".");
  const truncated = fraction.slice(0, PRICE_SCALE_DECIMALS).padEnd(PRICE_SCALE_DECIMALS, "0");
  return BigInt(whole) * PRICE_SCALE + BigInt(truncated);
}

/** Scales a raw integer oracle answer (e.g. Chainlink's `answer`) by its reported decimals into `PRICE_SCALE`. */
export function scaleRawAnswer(rawAnswer: string, decimals: number): bigint {
  if (!/^\d+$/.test(rawAnswer.trim())) throw new RangeError(`"${rawAnswer}" is not a non-negative integer.`);
  const raw = BigInt(rawAnswer.trim());
  const feedScale = 10n ** BigInt(decimals);
  return (raw * PRICE_SCALE) / feedScale;
}

/** Inverts a `PRICE_SCALE`-scaled price (e.g. a feed quoted quote-per-base instead of base-per-quote). */
export function invertPrice(scaled: bigint): bigint | null {
  if (scaled === 0n) return null;
  return (PRICE_SCALE * PRICE_SCALE) / scaled;
}

export function formatScaledPrice(value: bigint): string {
  const negative = value < 0n;
  const magnitude = negative ? -value : value;
  const whole = magnitude / PRICE_SCALE;
  const fraction = (magnitude % PRICE_SCALE).toString().padStart(PRICE_SCALE_DECIMALS, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

/** Signed spread of `sample` relative to `reference`, in basis points. Positive means sample is above reference. */
export function spreadBps(sample: bigint, reference: bigint): number | null {
  if (reference === 0n) return null;
  return Number(((sample - reference) * BPS_DENOMINATOR) / reference);
}
