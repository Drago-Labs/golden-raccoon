import { dedupeByCanonical, normalizeFeedItem, type FeedItem } from "./normalize";
import { REGIONAL_SOURCE_REGISTRY } from "./registry";
import type { RegionalArticle, RegionalNewsReport, RegionalSource } from "./schema";
import { translateArticle } from "./translation";

export type FeedFetcher = (source: RegionalSource) => Promise<FeedItem[]>;

export async function buildRegionalNewsReport(input: {
  observedAt?: string;
  symbol?: string;
  chain?: string;
  contractOrIssuer?: string;
}, deps: { fetchFeed?: FeedFetcher; translateFailIds?: string[] } = {}): Promise<RegionalNewsReport> {
  const observedAt = input.observedAt ?? new Date().toISOString();
  const sources: RegionalSource[] = REGIONAL_SOURCE_REGISTRY.map((source) => ({ ...source }));
  const rawArticles: RegionalArticle[] = [];
  let failedSourceCount = 0;

  for (const source of sources) {
    try {
      const items = deps.fetchFeed ? await deps.fetchFeed(source) : [];
      source.health = "healthy";
      for (const item of items) {
        const normalized = normalizeFeedItem(item, source.id);
        if (!normalized) continue;
        const translation = translateArticle(
          { title: normalized.title, summary: normalized.summary, language: normalized.language },
          { fail: deps.translateFailIds?.includes(source.id) },
        );
        const assetRefs =
          input.symbol && input.chain && input.contractOrIssuer
            ? [{ chain: input.chain, contractOrIssuer: input.contractOrIssuer, symbol: input.symbol }]
            : [];
        // Ticker-only mentions never become asset refs.
        rawArticles.push({
          articleId: normalized.articleId,
          sourceId: source.id,
          canonicalUrl: normalized.canonicalUrl,
          publishedAt: normalized.publishedAt,
          language: normalized.language,
          languageConfidence: normalized.languageConfidence,
          translation,
          assetRefs,
          syndicationOf: normalized.syndicationOf,
        });
      }
    } catch {
      source.health = "failed";
      failedSourceCount += 1;
    }
  }

  const { unique, duplicateCount } = dedupeByCanonical(rawArticles);
  const untranslatedCount = unique.filter((article) => article.translation.state === "failed" || article.translation.state === "low_confidence").length;
  const healthySourceCount = sources.filter((source) => source.health === "healthy").length;

  return {
    observedAt,
    sources,
    articles: unique,
    coverage: {
      languages: [...new Set(unique.map((article) => article.language))].sort(),
      regions: [...new Set(sources.map((source) => source.region))].sort(),
      healthySourceCount,
      failedSourceCount,
      untranslatedCount,
      duplicateSyndicationCount: duplicateCount,
      note: failedSourceCount
        ? "Failed sources lower coverage; they do not create fabricated evidence."
        : "Coverage reflects fetched regional sources only.",
    },
    scoreUnchanged: true,
  };
}
