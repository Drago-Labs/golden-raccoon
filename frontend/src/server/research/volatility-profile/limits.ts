export const VOLATILITY_PROFILE_LIMITS = {
  maxWindowDays: 365,
  maxPoints: 2_000,
  gapMultiplierThreshold: 1.5,
  outlierLogReturnThreshold: 0.5,
  annualizationPeriodsPerYear: {
    "1h": 365 * 24,
    "1d": 365,
  },
  providerTimeoutMs: 12_000,
} as const;
