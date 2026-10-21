export const QUORUM_LIMITS = {
  maxNodes: 500,
  maxDepth: 8,
  timeoutMs: 8_000,
  maxResponseBytes: 2_000_000,
  maxRequestBytes: 8_192,
  staleAfterSeconds: 86_400,
  maxTomlFetches: 50,
} as const;
