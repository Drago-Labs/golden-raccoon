import { STABLECOIN_FLOW_LIMITS } from "./limits";
import type { FlowEvent } from "./schema";

/**
 * The largest single mints and burns in the window, each keeping the
 * transaction it came from so a reader can open it on that chain's explorer.
 * Ties break by time, then chain, then transaction, so the ranking is stable
 * rather than dependent on provider order.
 */
export function largestEvents(events: FlowEvent[], count: number): FlowEvent[] {
  const limit = Math.min(Math.max(Math.trunc(count), 1), STABLECOIN_FLOW_LIMITS.maxRankedEvents);
  return [...events]
    .sort((left, right) => {
      const size = BigInt(right.amountUnits) - BigInt(left.amountUnits);
      if (size !== 0n) return size > 0n ? 1 : -1;
      return (
        right.at.localeCompare(left.at) || left.chain.localeCompare(right.chain) || left.txId.localeCompare(right.txId)
      );
    })
    .slice(0, limit);
}
