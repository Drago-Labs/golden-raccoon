/** Timeout and size bounds for the CCTP transfer tracker. */
export const CCTP_TRANSFER_LIMITS = {
  maxRequestBytes: 8_192,
  fetchTimeoutMs: 8_000,
  /**
   * Circle's `/v2/messages` endpoint can return more than one message for a
   * transaction that burned in multiple calls; only the first is inspected,
   * since the request names a single transfer to track, not a batch.
   */
  maxMessagesConsidered: 1,
} as const;
