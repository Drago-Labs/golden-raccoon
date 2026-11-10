export const EVENT_DECODER_LIMITS = {
  maxLedgerSpan: 10_000,
  maxEvents: 200,
  pageSize: 50,
  providerTimeoutMs: 10_000,
  maxRequestBytes: 32_768,
} as const;
