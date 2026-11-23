export const ATTRIBUTION_LIMITS = {
  /** Largest accepted request body. */
  maxRequestBytes: 262_144,
  /** Per-provider request timeout. */
  timeoutMs: 8_000,
  /** Longest window that may be attributed, in days. */
  maxWindowDays: 370,
  /** Periods a single report may contain. */
  maxPeriods: 120,
  /** Recorded snapshots accepted in one request. */
  maxSnapshots: 400,
  /** Holdings accepted per snapshot. */
  maxHoldingsPerSnapshot: 200,
  /** Transfer-history records read per request. */
  maxFlowRecords: 500,
  /** Records per page of the transaction-history read API. */
  flowPageSize: 200,
  /** Pages of transfer history read per request. */
  maxFlowPages: 5,
  /** USD amounts are integers of 10^-8 USD. */
  usdDecimals: 8,
  /** Asset quantities are integers of 10^-18 units. */
  quantityDecimals: 18,
} as const;
