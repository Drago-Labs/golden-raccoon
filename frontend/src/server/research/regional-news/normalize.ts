export type FeedItem = {
  title: string;
  link?: string;
  summary?: string;
  publishedAt?: string;
  language?: string;
  syndicatedFrom?: string;
};

export function normalizeFeedItem(item: FeedItem, sourceId: string): {
  articleId: string;
  canonicalUrl: string;
  publishedAt: string | null;
  language: string;
  languageConfidence: number;
  title: string;
  summary: string | null;
  syndicationOf: string | null;
} | null {
  const link = item.link?.trim();
  if (!link) return null;
  let canonicalUrl = link;
  try {
    const url = new URL(link);
    url.hash = "";
    canonicalUrl = url.toString();
  } catch {
    return null;
  }
  const language = item.language?.trim() || "und";
  return {
    articleId: `${sourceId}:${canonicalUrl}`,
    canonicalUrl,
    publishedAt: item.publishedAt ?? null,
    language,
    languageConfidence: item.language ? 0.95 : 0.2,
    title: item.title.trim(),
    summary: item.summary?.trim() || null,
    syndicationOf: item.syndicatedFrom ?? null,
  };
}

export function dedupeByCanonical<T extends { canonicalUrl: string; syndicationOf: string | null }>(articles: T[]): { unique: T[]; duplicateCount: number } {
  const seen = new Set<string>();
  const unique: T[] = [];
  let duplicateCount = 0;
  for (const article of articles) {
    const key = article.syndicationOf ?? article.canonicalUrl;
    if (seen.has(key)) {
      duplicateCount += 1;
      continue;
    }
    seen.add(key);
    unique.push(article);
  }
  return { unique, duplicateCount };
}
