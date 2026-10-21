export const BALANCE_LIMITS = {
  maxPages: 5,
  pageSize: 200,
  maxEffects: 1_000,
  maxLedgerWindow: 500_000,
  timeoutMs: 8_000,
  maxResponseBytes: 1_000_000,
  maxRequestBytes: 16_384,
} as const;
