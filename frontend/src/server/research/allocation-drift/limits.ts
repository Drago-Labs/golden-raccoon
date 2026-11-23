export const ALLOCATION_LIMITS = {
  maxRequestBytes: 200_000,
  maxHoldings: 200,
  maxTargets: 100,
  maxSnapshots: 80,
  maxWindowMs: 90 * 86_400_000,
} as const;
