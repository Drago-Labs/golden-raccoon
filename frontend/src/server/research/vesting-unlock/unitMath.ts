/**
 * Exact arithmetic over vesting amounts.
 *
 * Every sum is `bigint`. Unlock amounts are integer counts of the smallest
 * unit for the asset, and floating point cannot hold large magnitudes without
 * losing low digits. Floating point never appears in these helpers.
 */
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

export function sumBaseUnits(values: Array<string | null | undefined>): string {
  let total = 0n;

  for (const value of values) {
    const parsed = parseAmount(value);

    if (parsed !== null) total += parsed;
  }

  return total.toString();
}

/**
 * Splits a total into `segments` equal parts with remainder on the last part,
 * so linear vesting never invents or loses a single base unit.
 */
export function splitExact(totalBaseUnits: string, segments: number): string[] {
  if (segments <= 0) return [];

  const total = parseAmount(totalBaseUnits);

  if (total === null) return [];

  const each = total / BigInt(segments);
  const parts: string[] = [];
  let allocated = 0n;

  for (let index = 0; index < segments; index += 1) {
    if (index === segments - 1) {
      parts.push((total - allocated).toString());
    } else {
      parts.push(each.toString());
      allocated += each;
    }
  }

  return parts;
}

export function formatBaseUnits(baseUnits: string, decimals: number): string {
  const parsed = parseAmount(baseUnits);

  if (parsed === null) return "unknown";

  const negative = parsed < 0n;
  const digits = (negative ? -parsed : parsed).toString().padStart(decimals + 1, "0");
  const whole = digits.slice(0, digits.length - decimals);
  const fraction = decimals === 0 ? "" : digits.slice(digits.length - decimals).replace(/0+$/, "");

  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}
