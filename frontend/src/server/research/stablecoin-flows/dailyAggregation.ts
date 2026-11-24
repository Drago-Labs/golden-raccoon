import { decimalFromUnits } from "./normalization";
import type { DailyFlow, FlowEvent } from "./schema";
import { daysInWindow, type ResolvedWindow } from "./windowing";

/**
 * Totals mints and burns per UTC day and chain with exact integer arithmetic.
 * Every day the window touches gets a row for every chain that was read, so a
 * day with no flow reads as a zero rather than as a gap.
 */
export function aggregateDaily(
  events: FlowEvent[],
  chains: string[],
  window: ResolvedWindow,
  canonicalDecimals: number,
): DailyFlow[] {
  const buckets = new Map<string, { mint: bigint; burn: bigint; count: number }>();
  const key = (day: string, chain: string) => `${day}|${chain}`;

  for (const day of daysInWindow(window)) {
    for (const chain of chains) buckets.set(key(day, chain), { mint: 0n, burn: 0n, count: 0 });
  }

  for (const event of events) {
    const bucket = buckets.get(key(event.day, event.chain)) ?? { mint: 0n, burn: 0n, count: 0 };
    const units = BigInt(event.amountUnits);
    if (event.direction === "mint") bucket.mint += units;
    else bucket.burn += units;
    bucket.count += 1;
    buckets.set(key(event.day, event.chain), bucket);
  }

  return [...buckets.entries()]
    .map(([composite, bucket]) => {
      const [day, chain] = composite.split("|");
      const net = bucket.mint - bucket.burn;
      return {
        day,
        chain,
        mintUnits: bucket.mint.toString(),
        burnUnits: bucket.burn.toString(),
        netUnits: net.toString(),
        mint: decimalFromUnits(bucket.mint, canonicalDecimals),
        burn: decimalFromUnits(bucket.burn, canonicalDecimals),
        net: decimalFromUnits(net, canonicalDecimals),
        eventCount: bucket.count,
      };
    })
    .sort((left, right) => left.day.localeCompare(right.day) || left.chain.localeCompare(right.chain));
}
