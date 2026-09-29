/**
 * Public entry point for spam-and-dust review.
 *
 * Pure: classifies caller-supplied holdings, applies local visibility
 * preferences, and never mutates the portfolio record or fetches token URLs.
 */
import { classifyHolding, reviewNote } from "./classify";
import { assetKeyFor } from "./keys";
import { applyHiddenFlag, normalizePreferences } from "./preferences";
import {
  SPAM_DUST_SCHEMA_VERSION,
  SpamDustError,
  spamDustRequestSchema,
  type BalanceUncertainty,
  type HoldingReview,
  type SpamDustCoverage,
  type SpamDustReport,
} from "./schema";

function buildUncertainty(holdings: HoldingReview[]): BalanceUncertainty {
  const visible = holdings.filter((holding) => !holding.hidden);
  const hidden = holdings.filter((holding) => holding.hidden);
  const unpricedHoldingCount = holdings.filter((holding) => holding.signals.some((signal) => signal.kind === "unpriced")).length;

  const visibleValueUsd = visible.reduce((sum, holding) => sum + holding.valueUsd, 0);
  const hiddenValueUsd = hidden.reduce((sum, holding) => sum + holding.valueUsd, 0);

  return {
    visibleValueUsd,
    hiddenValueUsd,
    unpricedHoldingCount,
    hiddenHoldingCount: hidden.length,
    note:
      hidden.length === 0 && unpricedHoldingCount === 0
        ? "All holdings are visible with priced values in this local view."
        : `Hidden assets remain discoverable (${hidden.length}). Unpriced holdings (${unpricedHoldingCount}) contribute to total-balance uncertainty.`,
  };
}

function buildCoverage(
  holdings: HoldingReview[],
  providerStatus: "connected" | "unavailable",
): SpamDustCoverage {
  if (providerStatus === "unavailable") {
    return {
      state: "provider_failed",
      holdingCount: holdings.length,
      reviewRecommendedCount: 0,
      hiddenCount: holdings.filter((holding) => holding.hidden).length,
      note: "Provider was unavailable; classification ran only on the holdings supplied in the request.",
    };
  }

  if (holdings.length === 0) {
    return {
      state: "empty",
      holdingCount: 0,
      reviewRecommendedCount: 0,
      hiddenCount: 0,
      note: "No holdings were supplied for this wallet and chain.",
    };
  }

  const reviewRecommendedCount = holdings.filter((holding) => holding.reviewRecommended).length;
  const hiddenCount = holdings.filter((holding) => holding.hidden).length;

  return {
    state: reviewRecommendedCount > 0 || hiddenCount > 0 ? "partial" : "complete",
    holdingCount: holdings.length,
    reviewRecommendedCount,
    hiddenCount,
    note:
      reviewRecommendedCount === 0
        ? `Reviewed ${holdings.length} holding${holdings.length === 1 ? "" : "s"} with no spam/dust signals.`
        : `${reviewRecommendedCount} holding${reviewRecommendedCount === 1 ? "" : "s"} recommended for review; ${hiddenCount} hidden locally.`,
  };
}

export function reviewSpamDust(input: unknown): SpamDustReport {
  const parsed = spamDustRequestSchema.safeParse(input);

  if (!parsed.success) {
    throw new SpamDustError("invalid_request", "The spam-dust review request could not be read.", parsed.error.flatten());
  }

  const request = parsed.data;
  const generatedAtMs = Date.parse(request.generatedAt);

  if (!Number.isFinite(generatedAtMs)) {
    throw new SpamDustError("invalid_generated_at", "The report timestamp could not be read.");
  }

  const generatedAt = new Date(generatedAtMs).toISOString();

  const reviews: HoldingReview[] = request.holdings.map((holding) => {
    const assetKey = assetKeyFor(holding, request.chainId);
    const signals = classifyHolding(holding);
    const priced = typeof holding.priceUsd === "number" && holding.priceUsd > 0;
    const valueUsd = holding.valueUsd ?? (priced && holding.priceUsd ? holding.balance * holding.priceUsd : 0);

    return {
      assetKey,
      symbol: holding.symbol,
      name: holding.name,
      chainId: holding.chainId ?? request.chainId,
      balance: holding.balance,
      priceUsd: holding.priceUsd ?? null,
      valueUsd,
      allocationPercent: holding.allocationPercent ?? 0,
      isVerified: holding.isVerified ?? false,
      logoUrl: holding.logoUrl ?? null,
      signals,
      reviewRecommended: signals.length > 0,
      hidden: false,
      note: reviewNote(signals, false),
    };
  });

  const validKeys = new Set(reviews.map((holding) => holding.assetKey));
  const preferences = normalizePreferences(request.preferences, generatedAt, validKeys);
  const holdings = applyHiddenFlag(reviews, preferences);

  return {
    schemaVersion: SPAM_DUST_SCHEMA_VERSION,
    walletId: request.walletId,
    chainId: request.chainId,
    generatedAt,
    holdings,
    preferences,
    preferenceExport: {
      format: "spam-dust-prefs/2026-01",
      walletId: request.walletId,
      chainId: request.chainId,
      preferences,
    },
    uncertainty: buildUncertainty(holdings),
    coverage: buildCoverage(holdings, request.providerStatus),
    portfolioUnchanged: true,
  };
}

export { SpamDustError } from "./schema";
export type { SpamDustReport } from "./schema";
