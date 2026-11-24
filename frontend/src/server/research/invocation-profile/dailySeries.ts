import type { AttributedInvocation, DailyPoint } from "./schema";

/** Build a day-keyed success/failure and unique-caller series. */
export function buildDailySeries(invocations: AttributedInvocation[]): DailyPoint[] {
  const byDay = new Map<string, { successCount: number; failureCount: number; callers: Set<string> }>();

  for (const row of invocations) {
    let bucket = byDay.get(row.day);
    if (!bucket) {
      bucket = { successCount: 0, failureCount: 0, callers: new Set() };
      byDay.set(row.day, bucket);
    }
    if (row.success) bucket.successCount += 1;
    else bucket.failureCount += 1;
    bucket.callers.add(row.originatingAccount);
  }

  return [...byDay.entries()]
    .map(([day, bucket]) => ({
      day,
      successCount: bucket.successCount,
      failureCount: bucket.failureCount,
      uniqueCallers: bucket.callers.size,
    }))
    .sort((a, b) => a.day.localeCompare(b.day));
}
