/**
 * Decimal-safe price arithmetic and deviation calculation.
 *
 * Prices are parsed into `SCALE`-scaled bigints, so a peg target of 0.83 EUR or
 * 1.0000001 USD is represented exactly and a deviation of a fraction of a basis
 * point does not disappear into float error.
 */

export const SCALE_DECIMALS = 18;
export const SCALE = 10n ** BigInt(SCALE_DECIMALS);
const BPS = 10_000n;

export function parseDecimal(value: string): bigint {
  const trimmed = value.trim();

  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new RangeError(`"${value}" is not a non-negative decimal.`);
  }

  const [whole, fraction = ""] = trimmed.split(".");
  const padded = fraction.slice(0, SCALE_DECIMALS).padEnd(SCALE_DECIMALS, "0");

  return BigInt(whole) * SCALE + BigInt(padded);
}

export function formatDecimal(value: bigint): string {
  const negative = value < 0n;
  const magnitude = negative ? -value : value;
  const whole = magnitude / SCALE;
  const fraction = (magnitude % SCALE).toString().padStart(SCALE_DECIMALS, "0").replace(/0+$/, "");

  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

export function multiply(left: bigint, right: bigint): bigint {
  return (left * right) / SCALE;
}

export function divide(left: bigint, right: bigint): bigint {
  if (right === 0n) throw new RangeError("Division by zero.");
  return (left * SCALE) / right;
}

/**
 * Signed deviation from target, in basis points.
 *
 * Positive means the observation sits above the declared target. The result is
 * truncated toward zero, so a value fractionally past a threshold is not
 * rounded into an episode it did not reach.
 */
export function deviationBps(observed: bigint, target: bigint): number | null {
  if (target === 0n) return null;
  return Number(((observed - target) * BPS) / target);
}
