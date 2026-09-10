import type { DiscoveryCursor, ProviderPollingConfig } from "./types";

/** Backoff takes priority even when the checkpoint is stale. */
export function isPollDue(cursor: DiscoveryCursor | null, config: ProviderPollingConfig, now = Date.now()): boolean {
  if (!cursor) return true;
  if (now < cursor.nextAllowedPollMs) return false;
  // Once backoff expires, retry failures without another freshness delay.
  if (cursor.consecutiveFailures > 0) return true;
  const age = now - Date.parse(cursor.updatedAt);
  return !Number.isFinite(age) || age > config.freshness.maxCursorAgeMs || age >= config.freshness.pollIntervalMs;
}

/** Process-local overlap protection; this is not a distributed lease. */
export function createPollCoalescer<T>() {
  const pending = new Map<string, Promise<T>>();
  return (key: string, task: () => Promise<T>): Promise<T> => {
    const existing = pending.get(key);
    if (existing) return existing;
    const promise = Promise.resolve().then(task).finally(() => { pending.delete(key); });
    pending.set(key, promise);
    return promise;
  };
}
