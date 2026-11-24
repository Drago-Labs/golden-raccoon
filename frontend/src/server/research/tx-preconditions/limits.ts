/**
 * Pagination, timeout, and size bounds for precondition evaluation.
 * Every bound is enforced before a value is decoded or returned.
 */

export const TX_PRECONDITIONS_LIMITS = {
  /** Raw request body, in characters. */
  maxRequestBytes: 65_536,
  /** Pasted envelope XDR, in characters. */
  maxEnvelopeXdrChars: 49_152,
  /** Extra signers listed in one report (CAP-21 allows at most 2). */
  maxExtraSigners: 2,
  /** Horizon / RPC calls are abandoned after this many milliseconds. */
  timeoutMs: 8_000,
  /** Provider response body size limit. */
  maxResponseBytes: 1_000_000,
} as const;
