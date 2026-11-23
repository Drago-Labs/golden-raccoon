import { AttributionError } from "./errors";
import { ATTRIBUTION_LIMITS } from "./limits";

/**
 * Fixed-point helpers. Every amount in this feature is an integer of a known
 * scale — USD at 10^-8, quantities at 10^-18 — so no attribution figure is
 * ever produced by binary floating point. Truncation is always towards zero
 * and is always stated where it happens.
 */
export const USD_SCALE = 10n ** BigInt(ATTRIBUTION_LIMITS.usdDecimals);
export const QUANTITY_SCALE = 10n ** BigInt(ATTRIBUTION_LIMITS.quantityDecimals);

export function parseFixed(value: string | number, decimals: number, what = "amount"): bigint {
  const text = typeof value === "number" ? (Number.isFinite(value) ? value.toFixed(decimals) : "") : value.trim();
  if (!/^-?\d{1,40}(?:\.\d+)?$/.test(text)) {
    throw new AttributionError("malformed_snapshot", `"${value}" is not a usable ${what}.`);
  }
  const negative = text.startsWith("-");
  const [whole, fraction = ""] = text.replace("-", "").split(".");
  const units = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.slice(0, decimals).padEnd(decimals, "0"));
  return negative ? -units : units;
}

export function parseUsd(value: string | number, what = "USD amount"): bigint {
  return parseFixed(value, ATTRIBUTION_LIMITS.usdDecimals, what);
}

export function parseQuantity(value: string | number, what = "quantity"): bigint {
  return parseFixed(value, ATTRIBUTION_LIMITS.quantityDecimals, what);
}

/** Renders fixed-point units as a decimal string, keeping the sign and dropping trailing zeros. */
export function formatFixed(units: bigint, decimals: number): string {
  const scale = 10n ** BigInt(decimals);
  const sign = units < 0n ? "-" : "";
  const absolute = units < 0n ? -units : units;
  const fraction = (absolute % scale).toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${sign}${absolute / scale}${fraction ? `.${fraction}` : ""}`;
}

export function formatUsd(units: bigint): string {
  return formatFixed(units, ATTRIBUTION_LIMITS.usdDecimals);
}

export function formatQuantity(units: bigint): string {
  return formatFixed(units, ATTRIBUTION_LIMITS.quantityDecimals);
}

/**
 * Multiplies a quantity (10^-18) by a USD price per unit (10^-8) into a USD
 * amount (10^-8), truncating towards zero. The truncated remainder never
 * disappears from a report: the caller that uses this for a price effect
 * states the rest as the period's residual, so contributions still sum to the
 * observed change exactly.
 */
export function quantityTimesPrice(quantity: bigint, priceUsd: bigint): bigint {
  const product = quantity * priceUsd;
  const negative = product < 0n;
  const absolute = negative ? -product : product;
  const truncated = absolute / QUANTITY_SCALE;
  return negative ? -truncated : truncated;
}

/** Sums fixed-point units exactly. */
export function sum(values: Iterable<bigint>): bigint {
  let total = 0n;
  for (const value of values) total += value;
  return total;
}

/** Basis points of `part` in `whole`, truncated, or null when `whole` is zero. */
export function shareBps(part: bigint, whole: bigint): string | null {
  if (whole === 0n) return null;
  const magnitude = whole < 0n ? -whole : whole;
  return formatFixed((part * 1_000_000n) / magnitude, 2);
}
