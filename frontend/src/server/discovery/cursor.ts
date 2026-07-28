import type {
  DiscoveryChainId,
  DiscoveryCursor,
  DiscoveryProviderKind,
} from "@/server/discovery/types";
import type { BackoffConfig } from "@/server/discovery/types";

// ─── In-memory cursor store ──────────────────────────────────────────────────
// Persisted cursors survive restarts via JSON serialisation.
// In a production build this would write to Postgres; for the MVP the
// scheduler calls `dumpCursors()` / `loadCursors()` at start/stop.

const cursorStore = new Map<string, DiscoveryCursor>();

function storeKey(kind: DiscoveryProviderKind, chainId: DiscoveryChainId): string {
  return `${kind}::${chainId}`;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function getCursor(kind: DiscoveryProviderKind, chainId: DiscoveryChainId): DiscoveryCursor | null {
  return cursorStore.get(storeKey(kind, chainId)) ?? null;
}

export function upsertCursor(cursor: DiscoveryCursor): void {
  cursorStore.set(storeKey(cursor.providerKind, cursor.chainId), { ...cursor });
}

export function listCursors(): DiscoveryCursor[] {
  return Array.from(cursorStore.values());
}

export function listCursorsForProvider(kind: DiscoveryProviderKind): DiscoveryCursor[] {
  return Array.from(cursorStore.values()).filter((c) => c.providerKind === kind);
}

export function updateCursorFailure(
  kind: DiscoveryProviderKind,
  chainId: DiscoveryChainId,
  backoffConfig: BackoffConfig,
): DiscoveryCursor {
  const existing = getCursor(kind, chainId);
  const consecutiveFailures = (existing?.consecutiveFailures ?? 0) + 1;
  const delayMs = Math.min(
    backoffConfig.initialMs * Math.pow(backoffConfig.multiplier, consecutiveFailures - 1),
    backoffConfig.maxMs,
  );
  const cursor: DiscoveryCursor = {
    providerKind: kind,
    chainId,
    cursor: existing?.cursor ?? "",
    updatedAt: new Date().toISOString(),
    consecutiveFailures,
    nextAllowedPollMs: Date.now() + delayMs,
  };
  upsertCursor(cursor);
  return cursor;
}

export function updateCursorSuccess(
  kind: DiscoveryProviderKind,
  chainId: DiscoveryChainId,
  newCursor: string,
): DiscoveryCursor {
  const cursor: DiscoveryCursor = {
    providerKind: kind,
    chainId,
    cursor: newCursor,
    updatedAt: new Date().toISOString(),
    consecutiveFailures: 0,
    nextAllowedPollMs: 0,
  };
  upsertCursor(cursor);
  return cursor;
}

export function isCursorReady(cursor: DiscoveryCursor | null): boolean {
  if (!cursor) return true;
  return Date.now() >= cursor.nextAllowedPollMs;
}

export function isCursorStale(cursor: DiscoveryCursor, maxCursorAgeMs: number): boolean {
  const age = Date.now() - new Date(cursor.updatedAt).getTime();
  return age > maxCursorAgeMs;
}

/**
 * Serialise all cursors to a JSON-serialisable structure for persistence.
 */
export function dumpCursors(): Record<string, unknown>[] {
  return Array.from(cursorStore.entries()).map(([key, cursor]) => ({
    ...cursor,
    _key: key,
  }));
}

/**
 * Restore cursors from a previously dumped array.
 */
export function loadCursors(dumped: Record<string, unknown>[]): void {
  for (const entry of dumped) {
    const { _key, ...cursor } = entry;
    cursorStore.set(_key as string, cursor as unknown as DiscoveryCursor);
  }
}

/**
 * Reset all cursors (used in tests / fixture replay).
 */
export function resetCursors(): void {
  cursorStore.clear();
}
