/** Pagination, timeout and size bounds for the policy-change tracker. */
export const POLICY_CHANGE_LIMITS = {
  maxRequestBytes: 262_144,
  maxPageBytes: 1_000_000,
  maxExtractedChars: 200_000,
  maxRedirects: 3,
  fetchTimeoutMs: 6_000,
  maxPriorSnapshots: 50,
  maxDiffRows: 200,
  maxFigureChanges: 100,
} as const;
