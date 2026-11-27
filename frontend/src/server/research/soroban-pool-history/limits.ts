export const POOL_HISTORY_LIMITS = {
  maxRequestBytes: 16_384,
  maxResponseBytes: 1_000_000,
  maxLedgerWindow: 100_000,
  maxEvents: 5_000,
  maxPages: 10,
  pageSize: 200,
  maxLargeTrades: 25,
  timeoutMs: 30_000,
} as const;
