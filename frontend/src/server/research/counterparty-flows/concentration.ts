/**
 * Exact integer concentration: top-N share and Herfindahl.
 * Amounts are stroops (10^-7). Shares are reduced rationals, never floats.
 * Herfindahl is Σ y_i² / (Σ y_i)².
 */
import { COUNTERPARTY_FLOW_LIMITS } from "./limits";
import type { ExactRatio } from "./schema";

const SCALE = COUNTERPARTY_FLOW_LIMITS.amountScale;
const PLACES = COUNTERPARTY_FLOW_LIMITS.decimalPlaces;

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
  if (denominator === 0n) return { numerator: "0", denominator: "0" };
  const absNumerator = numerator < 0n ? -numerator : numerator;
  const absDenominator = denominator < 0n ? -denominator : denominator;
  const divisor = gcd(absNumerator, absDenominator);
  const negative = (numerator < 0n) !== (denominator < 0n);
  return {
    numerator: `${negative ? "-" : ""}${(absNumerator / divisor).toString()}`,
    denominator: (absDenominator / divisor).toString(),
  };
}

export function parseStroops(amount: string): bigint {
  const trimmed = amount.trim();
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(trimmed);
  if (!match) throw new Error(`Amount ${amount} is not an exact ${PLACES}-decimal Stellar value.`);
  const fraction = match[3] ?? "";
  if (fraction.length > PLACES) {
    throw new Error(`Amount ${amount} has more than ${PLACES} decimal places.`);
  }
  const sign = match[1] === "-" ? -1n : 1n;
  const padded = fraction.padEnd(PLACES, "0");
  return sign * (BigInt(match[2]) * SCALE + BigInt(padded || "0"));
}

export function formatStroops(value: bigint): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const whole = absolute / SCALE;
  const fraction = (absolute % SCALE).toString().padStart(PLACES, "0");
  return `${negative ? "-" : ""}${whole.toString()}.${fraction}`;
}

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
  counterpartyCount: number;
  totalStroops: bigint;
  topShares: Array<{ n: number; share: ExactRatio; stroops: bigint }>;
  herfindahl: ExactRatio;
};

export function computeConcentration(
  amounts: readonly bigint[],
  topNs: readonly number[] = COUNTERPARTY_FLOW_LIMITS.topNs,
): Concentration {
  const positive = amounts.filter((amount) => amount > 0n);
  const total = positive.reduce((sum, amount) => sum + amount, 0n);
  const undefinedRatio = { numerator: "0", denominator: "0" };

  if (positive.length === 0 || total === 0n) {
    return {
      defined: false,
      counterpartyCount: 0,
      totalStroops: 0n,
      topShares: topNs.map((n) => ({ n, share: undefinedRatio, stroops: 0n })),
      herfindahl: undefinedRatio,
    };
  }

  const descending = [...positive].sort((left, right) => (left === right ? 0 : left > right ? -1 : 1));
  let squares = 0n;
  for (const amount of positive) {
    squares += amount * amount;
  }

  return {
    defined: true,
    counterpartyCount: positive.length,
    totalStroops: total,
    topShares: topNs.map((n) => {
      const taken = descending.slice(0, Math.max(0, n));
      const amount = taken.reduce((sum, value) => sum + value, 0n);
      return { n, share: exactRatio(amount, total), stroops: amount };
    }),
    herfindahl: exactRatio(squares, total * total),
  };
}
