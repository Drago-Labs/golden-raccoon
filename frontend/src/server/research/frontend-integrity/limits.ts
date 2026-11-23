export const FRONTEND_INTEGRITY_LIMITS = {
  maxHtmlBytes: 200_000,
  timeoutMs: 8_000,
  maxScripts: 100,
  maxSnapshots: 20,
  maxRequestBytes: 250_000,
} as const;
