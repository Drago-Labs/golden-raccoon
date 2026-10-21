/**
 * Exact integer concentration: top-N share, Gini, and Herfindahl.
 *
 * Amounts are base units (10^-7 of a whole token). Shares are reduced
 * rational numbers, never IEEE floats.
 *
 * Sorted ascending with 1-based ranks, Gini is
 * `(2 * Σ i*y_i − (n+1) * Σ y_i) / (n * Σ y_i)`.
 * Herfindahl is `Σ y_i^2 / (Σ y_i)^2`.
 * A zero balance is not a holder of supply and is left out of both.
 */
import { HolderDistributionError } from "./errors";
import { HOLDER_LIMITS } from "./limits";
import type { ExactRatio } from "./schema";

const SCALE = HOLDER_LIMITS.amountScale;
const PLACES = HOLDER_LIMITS.decimalPlaces;

export function gcd(left: bigint, right: bigint): bigint {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;

  while (b !== 0n) {
    const next = a % b;
    a = b;
    b = next;
  }

  return a === 0n ? 1n : a;
}

export function exactRatio(numerator: bigint, denominator: bigint): ExactRatio {
  if (denominator === 0n) {
    return { numerator: "0", denominator: "0" };
  }

  const absNumerator = numerator < 0n ? -numerator : numerator;
  const absDenominator = denominator < 0n ? -denominator : denominator;
  const divisor = gcd(absNumerator, absDenominator);
  const negative = (numerator < 0n) !== (denominator < 0n);

  return {
    numerator: `${negative ? "-" : ""}${(absNumerator / divisor).toString()}`,
    denominator: (absDenominator / divisor).toString(),
  };
}

export function parseBaseUnits(amount: string): bigint {
  const trimmed = amount.trim();
  const match = /^(\d+)(?:\.(\d+))?$/.exec(trimmed);

  if (!match) {
    throw new HolderDistributionError("provider_unavailable", `Amount ${amount} is not an exact ${PLACES}-decimal Stellar value.`);
  }

  const whole = BigInt(match[1]);
  const fraction = match[2] ?? "";

  if (fraction.length > PLACES) {
    throw new HolderDistributionError("provider_unavailable", `Amount ${amount} has more than ${PLACES} decimal places.`);
  }

  const padded = fraction.padEnd(PLACES, "0");

  return whole * SCALE + BigInt(padded || "0");
}

export function formatBaseUnits(value: bigint): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const whole = absolute / SCALE;
  const fraction = (absolute % SCALE).toString().padStart(PLACES, "0");

  return `${negative ? "-" : ""}${whole.toString()}.${fraction}`;
}

/** Percent with two truncated decimal places, from the rational, not from a float. */
export function formatSharePercent(ratio: ExactRatio): string {
  if (ratio.denominator === "0") return "n/a";

  const denominator = BigInt(ratio.denominator);

  if (denominator === 0n) return "n/a";

  const scaled = (BigInt(ratio.numerator) * 10_000n) / denominator;
  const whole = scaled / 100n;
  const fraction = (scaled % 100n).toString().padStart(2, "0");

  return `${whole.toString()}.${fraction}%`;
}

export type Concentration = {
  defined: boolean;
  holderCount: number;
  totalBaseUnits: bigint;
  topShares: { n: number; share: ExactRatio; baseUnits: bigint }[];
  gini: ExactRatio;
  herfindahl: ExactRatio;
};

export function computeConcentration(amounts: readonly bigint[], topNs: readonly number[]): Concentration {
  const positive = amounts.filter((amount) => amount > 0n);
  const total = positive.reduce((sum, amount) => sum + amount, 0n);

  if (positive.length === 0 || total === 0n) {
    const undefinedRatio = { numerator: "0", denominator: "0" };

    return {
      defined: false,
      holderCount: 0,
      totalBaseUnits: 0n,
      topShares: topNs.map((n) => ({ n, share: undefinedRatio, baseUnits: 0n })),
      gini: undefinedRatio,
      herfindahl: undefinedRatio,
    };
  }

  const descending = [...positive].sort((left, right) => (left === right ? 0 : left > right ? -1 : 1));
  const ascending = [...descending].reverse();
  let weighted = 0n;
  let squares = 0n;

  ascending.forEach((amount, index) => {
    weighted += BigInt(index + 1) * amount;
    squares += amount * amount;
  });

  const count = BigInt(ascending.length);
  const giniNumerator = 2n * weighted - (count + 1n) * total;
  const giniDenominator = count * total;

  return {
    defined: true,
    holderCount: ascending.length,
    totalBaseUnits: total,
    topShares: topNs.map((n) => {
      const taken = descending.slice(0, Math.max(0, n));
      const amount = taken.reduce((sum, value) => sum + value, 0n);

      return { n, share: exactRatio(amount, total), baseUnits: amount };
    }),
    gini: exactRatio(giniNumerator, giniDenominator),
    herfindahl: exactRatio(squares, total * total),
  };
}
