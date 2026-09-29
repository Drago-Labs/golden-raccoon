import { z } from "zod";

export type SourceHealth = "configured" | "healthy" | "failed" | "unfetched";

export type RegionalSource = {
  id: string;
  publisher: string;
  language: string;
  region: string;
  feedType: "rss" | "atom" | "api";
  feedUrl: string;
  health: SourceHealth;
};

export type TranslationMeta = {
  originalTitle: string;
  originalSummary: string | null;
  translatedTitle: string | null;
  translatedSummary: string | null;
  translator: string;
  translatorVersion: string;
  confidence: number;
  state: "ok" | "low_confidence" | "failed" | "skipped";
  needsManualReview: boolean;
};

export type RegionalArticle = {
  articleId: string;
  sourceId: string;
  canonicalUrl: string;
  publishedAt: string | null;
  language: string;
  languageConfidence: number;
  translation: TranslationMeta;
  assetRefs: Array<{ chain: string; contractOrIssuer: string; symbol: string }>;
  syndicationOf: string | null;
};

export type RegionalNewsReport = {
  observedAt: string;
  sources: RegionalSource[];
  articles: RegionalArticle[];
  coverage: {
    languages: string[];
    regions: string[];
    healthySourceCount: number;
    failedSourceCount: number;
    untranslatedCount: number;
    duplicateSyndicationCount: number;
    note: string;
  };
  scoreUnchanged: true;
};

export const regionalNewsRequestSchema = z.object({
  observedAt: z.string().datetime({ offset: true }).optional(),
  symbol: z.string().trim().max(32).optional(),
  chain: z.string().trim().max(32).optional(),
  contractOrIssuer: z.string().trim().max(128).optional(),
});
