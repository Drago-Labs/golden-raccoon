export const CLMM_POSITIONS_LIMITS = {
  maxRequestBytes: 8192,
  maxPositions: 64,
  maxPageSize: 32,
  timeoutMs: 30_000,
  maxResponseBytes: 512_000,
} as const;

export function boundedPageSize(value: number | undefined): number {
  const raw = value === undefined ? CLMM_POSITIONS_LIMITS.maxPageSize : Math.trunc(value);
  return Math.min(CLMM_POSITIONS_LIMITS.maxPageSize, Math.max(1, raw));
}
