/**
 * Exact arithmetic over fee amounts.
 *
 * Every sum here is `bigint`. A fee is an integer count of the smallest unit —
 * wei, stroops — and floating point cannot hold those magnitudes without
 * losing the low digits. `Number("21000000000000000") + …` is wrong in a way
 * that only shows up in the total, which is exactly where it would be
 * believed.
 *
 * Floating point appears in precisely one place: the fiat conversion, which is
 * an approximation by nature and is labelled with the price and time that
 * produced it.
 */
import { FEE_ASSET_SCALES, type FeeAssetKind, type FiatTotal } from "./schema";

/** Parses a hex quantity ("0x5208") or a decimal string into base units. */
export function parseAmount(value: string | undefined | null): bigint | null {
  if (value === undefined || value === null) return null;

  const trimmed = String(value).trim();

  try {
    if (/^0x[0-9a-fA-F]+$/.test(trimmed)) return BigInt(trimmed);
    if (/^\d+$/.test(trimmed)) return BigInt(trimmed);
  } catch {
    return null;
  }

  return null;
}

export function sumBaseUnits(values: Array<string | null>): string {
  let total = 0n;

  for (const value of values) {
    const parsed = parseAmount(value);

    // A null is skipped, never coerced to zero: the caller counts unknowns
    // separately so a missing amount cannot disappear into a total.
    if (parsed !== null) total += parsed;
  }

  return total.toString();
}

export function multiply(a: string | null, b: string | null): string | null {
  const left = parseAmount(a);
  const right = parseAmount(b);

  if (left === null || right === null) return null;

  return (left * right).toString();
}

export function addBaseUnits(a: string | null, b: string | null): string | null {
  const left = parseAmount(a);
  const right = parseAmount(b);

  if (left === null && right === null) return null;

  return ((left ?? 0n) + (right ?? 0n)).toString();
}

/**
 * Renders base units as a decimal string, without going through a float.
 *
 * Digit surgery rather than division keeps every significant digit: a value of
 * 21_000_000_000_000_000 wei is "0.021", not "0.020999999999999998".
 */
export function formatBaseUnits(baseUnits: string, decimals: number): string {
  const parsed = parseAmount(baseUnits);

  if (parsed === null) return "unknown";

  const negative = parsed < 0n;
  const digits = (negative ? -parsed : parsed).toString().padStart(decimals + 1, "0");
  const whole = digits.slice(0, digits.length - decimals);
  const fraction = decimals === 0 ? "" : digits.slice(digits.length - decimals).replace(/0+$/, "");

  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

export function scaleFor(kind: FeeAssetKind): number {
  return FEE_ASSET_SCALES[kind].decimals;
}

/**
 * Converts a base-unit total to fiat, and refuses to do so without evidence.
 *
 * Returns null when no price is supplied. The caller reports that as a reason,
 * not as a zero.
 */
export function toFiat(options: {
  baseUnits: string;
  decimals: number;
  unitPriceUsd: number | null;
  pricedAt: string | null;
  appliedToCount: number;
}): FiatTotal | null {
  const { baseUnits, decimals, unitPriceUsd, pricedAt, appliedToCount } = options;

  if (unitPriceUsd === null || pricedAt === null) return null;

  const parsed = parseAmount(baseUnits);

  if (parsed === null) return null;

  const whole = Number(formatBaseUnits(parsed.toString(), decimals));

  if (!Number.isFinite(whole)) return null;

  return {
    currency: "USD",
    amount: Number((whole * unitPriceUsd).toFixed(6)),
    unitPriceUsd,
    pricedAt,
    appliedToCount,
  };
}
