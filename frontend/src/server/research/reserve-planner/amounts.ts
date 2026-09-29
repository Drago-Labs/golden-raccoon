export function decimalToStroops(value: string): bigint {
  if (!/^\d+(\.\d{1,7})?$/.test(value)) throw new Error("Malformed Stellar amount");
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 10_000_000n + BigInt(fraction.padEnd(7, "0"));
}
