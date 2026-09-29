/**
 * Exact integer arithmetic for budget rows. No floating point.
 */

export function parseIntAmount(value: string): bigint {
  if (!/^\d+$/.test(value)) {
    throw new Error(`invalid_amount:${value}`);
  }
  return BigInt(value);
}

export function addAmounts(...values: string[]): string {
  return values.reduce((sum, value) => sum + parseIntAmount(value), 0n).toString();
}

export function subtractAmounts(left: string, right: string): string {
  const result = parseIntAmount(left) - parseIntAmount(right);
  if (result < 0n) {
    throw new Error("negative_result");
  }
  return result.toString();
}

export function compareAmounts(left: string, right: string): number {
  const a = parseIntAmount(left);
  const b = parseIntAmount(right);
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/** True when an amount exceeds typical EVM uint256 digit length. */
export function wouldOverflowNumber(value: string): boolean {
  try {
    parseIntAmount(value);
    return value.length > 78;
  } catch {
    return true;
  }
}
