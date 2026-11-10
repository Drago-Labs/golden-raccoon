import type { TimelockOperationStatus } from "./schema";

export function computeOperationStatus(input: {
  scheduledAtTimestamp: number;
  delaySeconds: number;
  recordedTimestamp: number;
  executed: boolean;
  cancelled: boolean;
}): TimelockOperationStatus {
  if (input.cancelled) return "cancelled";
  if (input.executed) return "done";
  const readyAt = input.scheduledAtTimestamp + input.delaySeconds;
  return input.recordedTimestamp >= readyAt ? "ready" : "pending";
}
