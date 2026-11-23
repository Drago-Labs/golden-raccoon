/** Bounds for one inventory request. The route rejects anything larger before it parses roles. */
export const PRIVILEGED_KEY_LIMITS = {
  maxContracts: 40,
  maxControllers: 80,
  timeoutMs: 8_000,
  maxRequestBytes: 120_000,
  pageSize: 20,
} as const;
