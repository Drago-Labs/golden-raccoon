export const goldenFixtureSuite = [
  "blue_chip_clean_token",
  "verified_stablecoin",
  "honeypot",
  "cannot_sell",
  "low_liquidity",
  "fake_official_social",
  "phishing_claim",
  "symbol_collision",
  "provider_unavailable",
  "conflicting_sources",
  // Stellar-specific fixtures
  "stellar_xlm",
  "stellar_known_classic",
  "stellar_restricted_asset",
  "stellar_sac",
  "stellar_sep41",
  "stellar_invalid_issuer",
  "stellar_unknown_contract",
  "stellar_unavailable_provider",
] as const;

export type GoldenFixtureName = (typeof goldenFixtureSuite)[number];

export const goldenScoreSnapshots: Record<GoldenFixtureName, { min: number; max: number; criticalNeverDowngrade?: boolean }> = {
  blue_chip_clean_token: { min: 0, max: 35 },
  verified_stablecoin: { min: 0, max: 25 },
  honeypot: { min: 75, max: 100, criticalNeverDowngrade: true },
  cannot_sell: { min: 75, max: 100, criticalNeverDowngrade: true },
  low_liquidity: { min: 50, max: 90 },
  fake_official_social: { min: 50, max: 100 },
  phishing_claim: { min: 75, max: 100, criticalNeverDowngrade: true },
  symbol_collision: { min: 40, max: 85 },
  provider_unavailable: { min: 40, max: 80 },
  conflicting_sources: { min: 50, max: 95 },
  // Stellar-specific fixture score ranges
  stellar_xlm: { min: 0, max: 30 },
  stellar_known_classic: { min: 0, max: 25 },
  stellar_restricted_asset: { min: 25, max: 55 },
  stellar_sac: { min: 0, max: 30 },
  stellar_sep41: { min: 30, max: 60 },
  stellar_invalid_issuer: { min: 60, max: 100 },
  stellar_unknown_contract: { min: 55, max: 100 },
  stellar_unavailable_provider: { min: 60, max: 100 },
};

export function assertGoldenScore(name: GoldenFixtureName, score: number) {
  const snapshot = goldenScoreSnapshots[name];

  return score >= snapshot.min && score <= snapshot.max;
}
