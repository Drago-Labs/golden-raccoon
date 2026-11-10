import type { RawScVal } from "./schema";

const TWO_POW_64 = 1n << 64n;

/**
 * Combines 64-bit high and 64-bit unsigned low parts into an exact 128-bit BigInt
 * string without floating-point precision loss.
 */
export function decode128Parts(raw: {
  type: "i128" | "u128";
  hi?: string;
  lo?: string;
  value?: string;
}): string {
  if (raw.value !== undefined) {
    return BigInt(raw.value).toString();
  }
  const hi = BigInt(raw.hi ?? "0");
  const lo = BigInt.asUintN(64, BigInt(raw.lo ?? "0"));
  const combined = hi * TWO_POW_64 + lo;
  return combined.toString();
}

export function decodeScVal(scval: RawScVal): string {
  switch (scval.type) {
    case "i128":
    case "u128":
      return decode128Parts(scval);
    case "vec":
      return `[${scval.items.map(decodeScVal).join(", ")}]`;
    case "map":
      return `{${scval.entries.map((e) => `${decodeScVal(e.key)}: ${decodeScVal(e.val)}`).join(", ")}}`;
    default:
      return scval.value;
  }
}
