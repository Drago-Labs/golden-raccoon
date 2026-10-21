const STROOPS = 10_000_000n;

export function decimalToStroops(value: string): bigint {
  const match = /^(-?)(\d+)(?:\.(\d{1,7}))?$/.exec(value.trim());
  if (!match) throw new Error(`Amount is not a 7-decimal value: ${value}`);
  const sign = match[1] === "-" ? -1n : 1n;
  const fraction = (match[3] ?? "").padEnd(7, "0");
  return sign * (BigInt(match[2] ?? "0") * STROOPS + BigInt(fraction));
}

export function stroopsToDecimal(value: bigint): string {
  const sign = value < 0n ? "-" : "";
  const absolute = value < 0n ? -value : value;
  const whole = absolute / STROOPS;
  const fraction = (absolute % STROOPS).toString().padStart(7, "0");
  return `${sign}${whole}.${fraction}`;
}

export function applyRunningBalance(opening: Map<string, bigint>, movements: Array<{ asset: string; stroops: bigint }>): Map<string, bigint> {
  const balances = new Map(opening);
  for (const movement of movements) {
    balances.set(movement.asset, (balances.get(movement.asset) ?? 0n) + movement.stroops);
  }
  return balances;
}
