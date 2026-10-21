/**
 * Pagination, timeout, and size bounds for one consistency check.
 *
 * Horizon serves an account as a single document. The page bounds therefore
 * limit how many RPC ledger keys we will ask for, and how many trustlines we
 * will compare. Anything past a bound is omitted and counted, not silently
 * dropped.
 */

export const CONSISTENCY_LIMITS = {
  maxRequestBytes: 32_768,
  timeoutMs: 8_000,
  maxPages: 4,
  pageSize: 20,
  maxTrustlines: 50,
  maxContractKeys: 20,
  maxTargetLength: 56,
  maxKeyLength: 64,
} as const;

export type ConsistencyLimits = typeof CONSISTENCY_LIMITS;

/** Keys one check will actually send, across every RPC page. */
export function maxLedgerKeys(limits: ConsistencyLimits = CONSISTENCY_LIMITS): number {
  return limits.maxPages * limits.pageSize;
}

/**
 * Keep the first `max` items and report how many were left out.
 * The omitted count is part of the result so coverage can name it.
 */
export function clampList<T>(items: readonly T[], max: number): { kept: T[]; omitted: number } {
  if (max < 0) {
    return { kept: [], omitted: items.length };
  }

  if (items.length <= max) {
    return { kept: [...items], omitted: 0 };
  }

  return { kept: items.slice(0, max), omitted: items.length - max };
}

/** Split ledger keys into pages and stop at `maxPages`. */
export function batchKeys<T>(
  keys: readonly T[],
  pageSize: number,
  maxPages: number,
): { pages: T[][]; omitted: number } {
  const size = Math.max(1, pageSize);
  const pages: T[][] = [];
  const allowed = Math.max(0, maxPages) * size;
  const kept = keys.slice(0, allowed);

  for (let index = 0; index < kept.length; index += size) {
    pages.push(kept.slice(index, index + size));
  }

  return { pages, omitted: Math.max(0, keys.length - kept.length) };
}
