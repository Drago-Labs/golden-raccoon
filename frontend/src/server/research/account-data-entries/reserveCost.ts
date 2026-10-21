const BASE_RESERVE_STROOPS = 5_000_000n;

function xlm(stroops: bigint): string {
  const whole = stroops / 10_000_000n;
  const fraction = (stroops % 10_000_000n).toString().padStart(7, "0");
  return `${whole}.${fraction}`;
}

/** One data entry is one subentry. Cost is the base reserve, before sponsorship. */
export function dataEntryReserve(entryCount: number): { perEntryXlm: string; totalXlm: string; totalStroops: string } {
  const count = BigInt(Math.max(0, entryCount));
  const total = count * BASE_RESERVE_STROOPS;
  return {
    perEntryXlm: xlm(BASE_RESERVE_STROOPS),
    totalXlm: xlm(total),
    totalStroops: total.toString(),
  };
}
