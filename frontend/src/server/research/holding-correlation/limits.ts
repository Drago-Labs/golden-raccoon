export const HOLDING_CORRELATION_LIMITS = {
  maxHoldings: 25,
  minOverlapPoints: 5,
  maxWindowDays: 365,
  defaultClusterThreshold: 0.75,
  providerTimeoutMs: 12_000,
  maxRequestBytes: 32_768,
} as const;
