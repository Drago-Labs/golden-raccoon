export const DELEGATION_LIMITS = { timeoutMs: 8_000, maxHistory: 100, maxCodeBytes: 24_576 } as const;
export function boundedHistoryLimit(value = 25): number { return Math.min(DELEGATION_LIMITS.maxHistory, Math.max(1, Math.trunc(value))); }
