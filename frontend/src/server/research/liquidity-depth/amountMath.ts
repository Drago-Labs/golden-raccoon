import { type ChainFamily } from "./schema";

const DEFAULT_INTERNAL_DECIMALS = 18;
const INTERNAL_SCALE = 10n ** BigInt(DEFAULT_INTERNAL_DECIMALS);

/**
 * Parses a decimal string representation of an amount into a BigInt given token decimals.
 */
export function parseDecimalToBigInt(value: string, decimals: number): bigint {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "0") return 0n;

  const isNegative = trimmed.startsWith("-");
  const cleaned = isNegative ? trimmed.slice(1) : trimmed;

  const [intPart = "0", rawFracPart = ""] = cleaned.split(".");
  const sanitizedInt = intPart.replace(/^0+(?=\d)/, "") || "0";
  const truncatedFrac = rawFracPart.slice(0, decimals);
  const paddedFrac = truncatedFrac.padEnd(decimals, "0");

  const combined = `${sanitizedInt}${paddedFrac}`;
  const result = BigInt(combined);
  return isNegative ? -result : result;
}

/**
 * Formats a BigInt into a human-readable decimal string with the given decimals.
 */
export function formatBigIntToDecimal(
  value: bigint,
  decimals: number,
  options?: { trimTrailingZeros?: boolean; maxPrecision?: number },
): string {
  if (decimals === 0) {
    return value.toString();
  }

  const isNegative = value < 0n;
  const abs = isNegative ? -value : value;
  const base = 10n ** BigInt(decimals);

  const intPart = abs / base;
  const fracPart = abs % base;

  let fracStr = fracPart.toString().padStart(decimals, "0");

  if (options?.maxPrecision !== undefined && options.maxPrecision < decimals) {
    fracStr = fracStr.slice(0, options.maxPrecision);
  }

  if (options?.trimTrailingZeros) {
    fracStr = fracStr.replace(/0+$/, "");
  }

  const sign = isNegative ? "-" : "";
  if (!fracStr) {
    return `${sign}${intPart.toString()}`;
  }

  return `${sign}${intPart.toString()}.${fracStr}`;
}

/**
 * Computes (a * b) / denominator with BigInt truncation to prevent intermediate overflow.
 */
export function mulDivBigInt(a: bigint, b: bigint, denominator: bigint): bigint {
  if (denominator === 0n) {
    throw new Error("Division by zero in mulDivBigInt");
  }
  return (a * b) / denominator;
}

/**
 * Adds two decimal strings using fixed-point BigInt arithmetic.
 */
export function safeAdd(a: string, b: string): string {
  const bigA = parseDecimalToBigInt(a, DEFAULT_INTERNAL_DECIMALS);
  const bigB = parseDecimalToBigInt(b, DEFAULT_INTERNAL_DECIMALS);
  return formatBigIntToDecimal(bigA + bigB, DEFAULT_INTERNAL_DECIMALS, { trimTrailingZeros: true });
}

/**
 * Subtracts two decimal strings using fixed-point BigInt arithmetic.
 */
export function safeSub(a: string, b: string): string {
  const bigA = parseDecimalToBigInt(a, DEFAULT_INTERNAL_DECIMALS);
  const bigB = parseDecimalToBigInt(b, DEFAULT_INTERNAL_DECIMALS);
  return formatBigIntToDecimal(bigA - bigB, DEFAULT_INTERNAL_DECIMALS, { trimTrailingZeros: true });
}

/**
 * Multiplies two decimal strings using fixed-point BigInt arithmetic.
 */
export function safeMul(a: string, b: string, maxDecimals = 8): string {
  const bigA = parseDecimalToBigInt(a, DEFAULT_INTERNAL_DECIMALS);
  const bigB = parseDecimalToBigInt(b, DEFAULT_INTERNAL_DECIMALS);
  const product = mulDivBigInt(bigA, bigB, INTERNAL_SCALE);
  return formatBigIntToDecimal(product, DEFAULT_INTERNAL_DECIMALS, {
    trimTrailingZeros: true,
    maxPrecision: maxDecimals,
  });
}

/**
 * Divides two decimal strings using fixed-point BigInt arithmetic.
 */
export function safeDiv(a: string, b: string, maxDecimals = 8): string {
  const bigA = parseDecimalToBigInt(a, DEFAULT_INTERNAL_DECIMALS);
  const bigB = parseDecimalToBigInt(b, DEFAULT_INTERNAL_DECIMALS);
  if (bigB === 0n) {
    throw new Error("Division by zero in safeDiv");
  }
  const quotient = mulDivBigInt(bigA, INTERNAL_SCALE, bigB);
  return formatBigIntToDecimal(quotient, DEFAULT_INTERNAL_DECIMALS, {
    trimTrailingZeros: true,
    maxPrecision: maxDecimals,
  });
}

/**
 * Compares two decimal strings (-1 if a < b, 0 if a == b, 1 if a > b).
 */
export function safeCompare(a: string, b: string): number {
  const bigA = parseDecimalToBigInt(a, DEFAULT_INTERNAL_DECIMALS);
  const bigB = parseDecimalToBigInt(b, DEFAULT_INTERNAL_DECIMALS);
  if (bigA < bigB) return -1;
  if (bigA > bigB) return 1;
  return 0;
}

/**
 * Applies basis points fee to a BigInt amount.
 */
export function applyFeeBps(
  amount: bigint,
  feeBps: number,
): bigint {
  if (feeBps < 0) {
    throw new Error("Fee basis points cannot be negative");
  }
  const feeAmount = (amount * BigInt(feeBps)) / 10000n;
  return amount - feeAmount;
}

/**
 * Computes price impact percentage between execution price and benchmark price.
 */
export function calculatePriceImpactPercent(
  executionPrice: string | number,
  benchmarkPrice: string | number,
): number {
  const benchmarkNum = typeof benchmarkPrice === "number" ? benchmarkPrice : Number.parseFloat(benchmarkPrice);
  const executionNum = typeof executionPrice === "number" ? executionPrice : Number.parseFloat(executionPrice);

  if (!Number.isFinite(benchmarkNum) || benchmarkNum <= 0) {
    return 0;
  }
  if (!Number.isFinite(executionNum) || executionNum <= 0) {
    return 0;
  }

  const impact = Math.abs((executionNum - benchmarkNum) / benchmarkNum) * 100;
  return Math.round(impact * 10000) / 10000;
}

/**
 * Normalizes raw and token-denominated amounts while preserving asset precision and chain identity.
 */
export function normalizeAssetAmount(
  rawOrDecimal: string | bigint | number,
  decimals: number,
  chainFamily: ChainFamily = "stellar",
): {
  rawBigInt: bigint;
  normalizedDecimal: string;
  decimals: number;
  chainFamily: ChainFamily;
} {
  const str = typeof rawOrDecimal === "bigint"
    ? rawOrDecimal.toString()
    : typeof rawOrDecimal === "number"
    ? rawOrDecimal.toString()
    : rawOrDecimal.trim();

  const isRaw = !str.includes(".") && /^\d+$/.test(str);
  let rawBigInt: bigint;
  let normalizedDecimal: string;

  if (isRaw) {
    rawBigInt = BigInt(str);
    normalizedDecimal = formatBigIntToDecimal(rawBigInt, decimals, { trimTrailingZeros: true });
  } else {
    normalizedDecimal = str;
    rawBigInt = parseDecimalToBigInt(normalizedDecimal, decimals);
  }

  return {
    rawBigInt,
    normalizedDecimal,
    decimals,
    chainFamily,
  };
}
