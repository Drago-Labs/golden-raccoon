/**
 * Pagination, timeout, and size bounds for network settings reads.
 * Every bound is enforced before a value is decoded or returned.
 */

export const NETWORK_SETTINGS_LIMITS = {
  /** Newest recorded upgrades kept in one response. */
  maxHistoryEntries: 24,
  /** Records accepted from a history source before it is rejected. */
  maxUpgradeRecords: 200,
  /** Decoded setting rows kept from one snapshot. */
  maxSettings: 4_000,
  /** Raw request body, in characters. */
  maxRequestBytes: 32_768,
  /** One ConfigSettingEntry XDR string, in characters. */
  maxSettingXdrBytes: 256_000,
  /** RPC calls are abandoned after this many milliseconds. */
  rpcTimeoutMs: 8_000,
  /** Rows returned for the current-settings page. */
  defaultPageSize: 50,
  maxPageSize: 100,
} as const;

export function pageWindow(length: number, page: number, pageSize = NETWORK_SETTINGS_LIMITS.defaultPageSize) {
  const size = Math.min(Math.max(pageSize, 1), NETWORK_SETTINGS_LIMITS.maxPageSize);
  const safePage = Number.isInteger(page) && page > 0 ? page : 1;
  const start = (safePage - 1) * size;

  return {
    page: safePage,
    pageSize: size,
    start,
    end: Math.min(length, start + size),
  };
}
