/** Bounds for one diagnosis. Larger envelopes are truncated and labelled partial. */
export const TX_FAILURE_LIMITS = {
  hashLength: 64,
  maxOperations: 100,
  maxStateLookups: 20,
  timeoutMs: 8_000,
  maxResponseBytes: 1_000_000,
  maxRequestBytes: 16_384,
} as const;
