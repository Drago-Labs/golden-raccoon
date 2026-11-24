const STROOPS = 10_000_000n;

/** Parse a classic Stellar decimal (up to 7 places) into stroops. */
export function decimalToStroops(value: string): bigint {
  const match = /^(-?)(\d+)(?:\.(\d{1,7}))?$/.exec(value.trim());
  if (!match) throw new Error(`Amount is not a 7-decimal value: ${value}`);
  const sign = match[1] === "-" ? -1n : 1n;
  const fraction = (match[3] ?? "").padEnd(7, "0");
  return sign * (BigInt(match[2] ?? "0") * STROOPS + BigInt(fraction));
}

/** Render stroops as a fixed 7-decimal string. */
export function stroopsToDecimal(value: bigint): string {
  const sign = value < 0n ? "-" : "";
  const absolute = value < 0n ? -value : value;
  const whole = absolute / STROOPS;
  const fraction = (absolute % STROOPS).toString().padStart(7, "0");
  return `${sign}${whole}.${fraction}`;
}

export function addStroops(left: bigint, right: bigint): bigint {
  return left + right;
}
