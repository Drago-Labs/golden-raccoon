export const INVOCATION_PROFILE_LIMITS = {
  maxRequestBytes: 8192,
  maxWindowLedgers: 100_000,
  maxInvocations: 10_000,
  maxFunctions: 500,
  maxCallers: 2_000,
  maxDailyPoints: 366,
  pageSize: 100,
  timeoutMs: 30_000,
} as const;
