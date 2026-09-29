/**
 * Versioned contract for the spam-and-dust review workspace.
 *
 * Classification is explainable and non-destructive. Visibility preferences are
 * wallet-scoped and chain-aware: hiding an asset never mutates the underlying
 * portfolio record, and a high-value unpriced holding is never treated as dust.
 */
import { z } from "zod";

export const SPAM_DUST_SCHEMA_VERSION = "spam-dust-review/2026-01" as const;

export const SPAM_DUST_LIMITS = {
  maxHoldings: 500,
  maxRequestBytes: 1_048_576,
  /** Priced holdings below this USD value may carry a tiny-value signal. */
  tinyValueUsd: 1,
  /** Allocation below this percent may reinforce tiny-value confidence. */
  tinyAllocationPercent: 0.2,
  maxPreferences: 500,
} as const;

export type SignalKind = "unpriced" | "tiny_value" | "unknown_issuer" | "suspicious_link";

export type Signal = {
  kind: SignalKind;
  confidence: number;
  detail: string;
};

export type AssetKeyParts = {
  chainId: string;
  symbol: string;
  tokenAddress: string | null;
  issuer: string | null;
  contractId: string | null;
};

export type HoldingReview = {
  assetKey: string;
  symbol: string;
  name: string;
  chainId: string;
  balance: number;
  priceUsd: number | null;
  valueUsd: number;
  allocationPercent: number;
  isVerified: boolean;
  logoUrl: string | null;
  signals: Signal[];
  /** True when any signal is present; never auto-hides high-value unpriced as dust. */
  reviewRecommended: boolean;
  hidden: boolean;
  note: string;
};

export type VisibilityPreference = {
  assetKey: string;
  hidden: boolean;
  updatedAt: string;
};

export type BalanceUncertainty = {
  visibleValueUsd: number;
  hiddenValueUsd: number;
  unpricedHoldingCount: number;
  hiddenHoldingCount: number;
  note: string;
};

export type SpamDustCoverage = {
  state: "complete" | "partial" | "empty" | "provider_failed";
  holdingCount: number;
  reviewRecommendedCount: number;
  hiddenCount: number;
  note: string;
};

export type SpamDustReport = {
  schemaVersion: typeof SPAM_DUST_SCHEMA_VERSION;
  walletId: string;
  chainId: string;
  generatedAt: string;
  holdings: HoldingReview[];
  preferences: VisibilityPreference[];
  /** Exportable reversible preference payload; never includes secrets. */
  preferenceExport: {
    format: "spam-dust-prefs/2026-01";
    walletId: string;
    chainId: string;
    preferences: VisibilityPreference[];
  };
  uncertainty: BalanceUncertainty;
  coverage: SpamDustCoverage;
  /** Explicit: on-chain holdings and portfolio risk scores are unchanged. */
  portfolioUnchanged: true;
};

const holdingSchema = z.object({
  symbol: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(200),
  chainId: z.string().trim().min(1).max(80).optional(),
  tokenAddress: z.string().trim().max(120).optional(),
  issuer: z.string().trim().max(120).optional(),
  contractId: z.string().trim().max(120).optional(),
  balance: z.number().finite(),
  priceUsd: z.number().finite().nullable().optional(),
  valueUsd: z.number().finite().optional(),
  allocationPercent: z.number().finite().min(0).max(100).optional(),
  isVerified: z.boolean().optional(),
  logoUrl: z.string().max(2_000).nullable().optional(),
  externalUrl: z.string().max(2_000).nullable().optional(),
});

const preferenceSchema = z.object({
  assetKey: z.string().trim().min(1).max(400),
  hidden: z.boolean(),
  updatedAt: z.string().datetime({ offset: true }).optional(),
});

export const spamDustRequestSchema = z.object({
  walletId: z.string().trim().min(1).max(120),
  chainId: z.string().trim().min(1).max(80),
  generatedAt: z.string().datetime({ offset: true }),
  providerStatus: z.enum(["connected", "unavailable"]).default("connected"),
  holdings: z.array(holdingSchema).max(SPAM_DUST_LIMITS.maxHoldings),
  preferences: z.array(preferenceSchema).max(SPAM_DUST_LIMITS.maxPreferences).default([]),
});

export type SpamDustRequest = z.infer<typeof spamDustRequestSchema>;
export type HoldingInput = z.infer<typeof holdingSchema>;
export type PreferenceInput = z.infer<typeof preferenceSchema>;

export class SpamDustError extends Error {
  readonly code: string;
  readonly details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "SpamDustError";
    this.code = code;
    this.details = details;
  }
}
