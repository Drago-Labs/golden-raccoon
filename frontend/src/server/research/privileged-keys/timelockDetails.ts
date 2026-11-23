import type { PrivilegeRecord } from "./schema";

/** A timelock is a controller with a positive delay. The delay is the recorded value, in seconds. */
export function timelockDelay(record: PrivilegeRecord): number | null {
  if (record.delaySeconds === undefined || record.delaySeconds <= 0) return null;
  return record.delaySeconds;
}
