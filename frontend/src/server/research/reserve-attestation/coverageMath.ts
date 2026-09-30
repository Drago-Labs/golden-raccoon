/**
 * Decimal-safe coverage-ratio arithmetic. A ratio is only ever computed from
 * two figures denominated in the same currency; anything else returns
 * `null` rather than a number that would misrepresent the claim.
 */
const SCALE_DECIMALS = 18;
const SCALE = 10n ** BigInt(SCALE_DECIMALS);
const BPS_DENOMINATOR = 10_000n;

export function parseDecimal(value: string): bigint {
  const trimmed = value.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) throw new RangeError(`"${value}" is not a non-negative decimal.`);
  const [whole, fraction = ""] = trimmed.split(".");
  const truncated = fraction.slice(0, SCALE_DECIMALS).padEnd(SCALE_DECIMALS, "0");
  return BigInt(whole) * SCALE + BigInt(truncated);
}

/**
 * Assets-to-liabilities ratio in basis points (10_000 = fully backed).
 * Returns `null` when liabilities are zero (nothing to divide by, not
 * "infinitely backed") rather than defaulting to a percentage.
 */
export function coverageRatioBps(claimedAssets: string, claimedLiabilities: string): number | null {
  const assets = parseDecimal(claimedAssets);
  const liabilities = parseDecimal(claimedLiabilities);
  if (liabilities === 0n) return null;
  return Number((assets * BPS_DENOMINATOR) / liabilities);
}
