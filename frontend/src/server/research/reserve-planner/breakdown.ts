import type { ReserveBreakdown } from "./schema";

export function stroopsToXlm(stroops: string): string {
  const value = BigInt(stroops);
  const whole = value / 10_000_000n;
  const fraction = (value % 10_000_000n).toString().padStart(7, "0").replace(/0+$/, "");
  return `${whole}${fraction ? `.${fraction}` : ""}`;
}

export function reserveDelta(before: ReserveBreakdown, after: ReserveBreakdown): bigint {
  return BigInt(after.minimumReserveStroops) - BigInt(before.minimumReserveStroops);
}
