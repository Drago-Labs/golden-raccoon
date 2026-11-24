import { formatStroops, parseStroops } from "./concentration";
import type { CounterpartyAssetTotal, FlowDirection, FlowEvent } from "./schema";
import type { IdentityLabel } from "./counterpartyLabels";

type BucketKey = string;

function keyOf(counterparty: string, asset: string, direction: FlowDirection): BucketKey {
  return `${direction}|${asset}|${counterparty}`;
}

/**
 * Aggregates inflow and outflow by counterparty and asset with stroop-safe totals.
 * Labels are applied after aggregation and never invent a name.
 */
export function aggregateFlows(
  events: readonly FlowEvent[],
  labels: Map<string, IdentityLabel | null>,
): CounterpartyAssetTotal[] {
  const buckets = new Map<BucketKey, { counterparty: string; asset: string; direction: FlowDirection; stroops: bigint; eventCount: number }>();

  for (const event of events) {
    const key = keyOf(event.counterparty, event.asset, event.direction);
    const stroops = parseStroops(event.amount);
    const existing = buckets.get(key);
    if (existing) {
      existing.stroops += stroops;
      existing.eventCount += 1;
    } else {
      buckets.set(key, {
        counterparty: event.counterparty,
        asset: event.asset,
        direction: event.direction,
        stroops,
        eventCount: 1,
      });
    }
  }

  const rows: CounterpartyAssetTotal[] = [...buckets.values()].map((bucket) => {
    const label = labels.get(bucket.counterparty) ?? null;
    return {
      counterparty: bucket.counterparty,
      label: label?.label ?? null,
      labelEvidence: label?.evidence ?? null,
      asset: bucket.asset,
      direction: bucket.direction,
      amount: formatStroops(bucket.stroops),
      eventCount: bucket.eventCount,
    };
  });

  return rows.sort((left, right) => {
    if (left.direction !== right.direction) return left.direction.localeCompare(right.direction);
    if (left.asset !== right.asset) return left.asset.localeCompare(right.asset);
    const leftStroops = parseStroops(left.amount);
    const rightStroops = parseStroops(right.amount);
    if (leftStroops === rightStroops) return left.counterparty.localeCompare(right.counterparty);
    return leftStroops > rightStroops ? -1 : 1;
  });
}
