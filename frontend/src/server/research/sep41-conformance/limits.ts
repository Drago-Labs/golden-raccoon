/**
 * Pagination, timeout, and size bounds for the SEP-41 conformance feature.
 */

export const SEP41_CONFORMANCE_LIMITS = {
  maxRequestBytes: 16_384,
  /** Maximum events retained from a single getEvents page. */
  maxEventSamples: 50,
  /** Maximum look-back window in ledgers when sampling events. */
  eventLookbackLedgers: 10_000,
  /** Timeout for a single Soroban RPC request. */
  rpcTimeoutMs: 12_000,
  /** Soft cap on serialized report size before the route refuses to return it. */
  maxResponseBytes: 256_000,
} as const;
