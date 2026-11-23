export const BRIDGE_LATENCY_LIMITS = {
  maxMessages: 500,
  timeoutMs: 8_000,
  maxRequestBytes: 200_000,
  defaultStuckSeconds: 3_600,
  pageSize: 25,
} as const;
