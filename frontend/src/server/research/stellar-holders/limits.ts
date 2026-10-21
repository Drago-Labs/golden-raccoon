/**
 * Published bounds for one holder-distribution read.
 *
 * Pagination, timeout, and payload size are capped here so a popular asset
 * cannot turn a single page view into an unbounded Horizon walk. Amounts use
 * the classic 7-decimal scale and stay integers; nothing in this feature
 * multiplies by a float.
 */

export const HOLDER_LIMITS = {
  /** Smallest units in one whole classic-asset unit (10^7). */
  amountScale: 10_000_000n,
  decimalPlaces: 7,
  pageSizeDefault: 200,
  maxPageSize: 200,
  maxPages: 5,
  maxHolders: 1_000,
  maxPools: 200,
  maxClaimables: 200,
  maxTopN: 50,
  defaultTopN: 10,
  topNs: [1, 5, 10] as const,
  timeoutMs: 8_000,
  maxRequestBytes: 16_384,
  maxTomlBytes: 100_000,
} as const;
