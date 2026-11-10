import { decodeTimelockCall } from "./calldataDecoder";
import { computeOperationStatus } from "./operationState";
import type { TimelockEventLog, TimelockOperation } from "./schema";

export function groupTimelockOperations(
  events: TimelockEventLog[],
  recordedTimestamp: number,
): TimelockOperation[] {
  const scheduledByOp = new Map<
    string,
    Array<Extract<TimelockEventLog, { kind: "CallScheduled" }>>
  >();
  const executedOps = new Set<string>();
  const cancelledOps = new Set<string>();

  for (const ev of events) {
    if (ev.kind === "CallScheduled") {
      const list = scheduledByOp.get(ev.operationId) ?? [];
      list.push(ev);
      scheduledByOp.set(ev.operationId, list);
    } else if (ev.kind === "CallExecuted") {
      executedOps.add(ev.operationId);
    } else if (ev.kind === "Cancelled") {
      cancelledOps.add(ev.operationId);
    }
  }

  const operations: TimelockOperation[] = [];
  for (const [operationId, calls] of scheduledByOp.entries()) {
    const ordered = [...calls].sort((a, b) => a.index - b.index);
    const first = ordered[0]!;
    const readyAt = first.scheduledAtTimestamp + first.delaySeconds;
    const status = computeOperationStatus({
      scheduledAtTimestamp: first.scheduledAtTimestamp,
      delaySeconds: first.delaySeconds,
      recordedTimestamp,
      executed: executedOps.has(operationId),
      cancelled: cancelledOps.has(operationId),
    });

    operations.push({
      operationId,
      status,
      scheduledAtTimestamp: first.scheduledAtTimestamp,
      readyAtTimestamp: readyAt,
      delaySeconds: first.delaySeconds,
      predecessor: first.predecessor,
      calls: ordered.map((c) =>
        decodeTimelockCall({
          index: c.index,
          target: c.target,
          valueWei: c.valueWei,
          data: c.data,
        }),
      ),
    });
  }

  return operations;
}
