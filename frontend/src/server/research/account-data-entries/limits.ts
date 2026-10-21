export const DATA_ENTRY_LIMITS = {
  maxPages: 5,
  pageSize: 200,
  maxOperations: 1_000,
  maxEntries: 100,
  timeoutMs: 8_000,
  maxResponseBytes: 1_000_000,
  maxRequestBytes: 16_384,
  recentWindowDefault: 30,
  recentWindowMax: 500_000,
} as const;
