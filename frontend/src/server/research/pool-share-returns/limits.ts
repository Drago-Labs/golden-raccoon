export const POOL_RETURNS_LIMITS = {
  maxRequestBytes: 8192,
  maxWindowLedgers: 100000,
  maxPositionSnapshots: 1000,
  maxReserveSnapshots: 10000,
  maxPricePoints: 10000,
  timeoutMs: 30000,
} as const;
