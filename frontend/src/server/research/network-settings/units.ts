/**
 * Unit labels and integer comparison for Soroban config values.
 * Values stay decimal strings so int64 fee terms are not rounded.
 */

export type NumericDirection = "increase" | "decrease" | "equal" | "non_numeric";

const INTEGER = /^-?\d+$/;

/** Compare two rendered setting values. Non-integers are not ranked. */
export function compareNumeric(before: string, after: string): NumericDirection {
  if (!INTEGER.test(before) || !INTEGER.test(after)) return "non_numeric";

  const left = BigInt(before);
  const right = BigInt(after);

  if (right > left) return "increase";
  if (right < left) return "decrease";

  return "equal";
}

/** Render a scalar the way the table and the diff both display it. */
export function formatSettingValue(value: bigint | number | boolean | string): string {
  if (typeof value === "boolean") return value ? "true" : "false";

  return String(value);
}
