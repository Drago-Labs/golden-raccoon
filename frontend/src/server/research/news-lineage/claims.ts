/**
 * Corrections and repeated reporting.
 *
 * A correction is recognised only when an article declares one. Nothing here
 * infers that a later article "corrects" an earlier one from wording, because
 * that inference would put words in a publisher's mouth.
 */
import type { ArticleRef } from "./schema";

export type CorrectionLink = {
  correctionArticleId: string;
  correctsArticleId: string;
  /** True when the corrected article is present in this evidence set. */
  targetPresent: boolean;
  detail: string;
};

export function findCorrections(articles: ArticleRef[]): CorrectionLink[] {
  const ids = new Set(articles.map((article) => article.articleId));
  const originalIds = new Map(
    articles.filter((article) => article.originalId).map((article) => [article.originalId!, article.articleId]),
  );

  return articles
    .filter((article) => article.correctionOf)
    .map((article) => {
      const target = article.correctionOf!;
      const resolved = ids.has(target) ? target : (originalIds.get(target) ?? null);

      return {
        correctionArticleId: article.articleId,
        correctsArticleId: resolved ?? target,
        targetPresent: resolved !== null,
        detail: resolved
          ? "This article declares itself a correction of another article in this evidence set."
          : "This article declares itself a correction of an article that is not in this evidence set, so the original claim cannot be inspected here.",
      };
    })
    .sort((left, right) => left.correctionArticleId.localeCompare(right.correctionArticleId));
}

/** Outlets that published more than once about the same lineage. */
export function repeatedOutlets(articles: ArticleRef[]): Array<{ outletId: string; articleIds: string[] }> {
  const byOutlet = new Map<string, string[]>();

  for (const article of articles) {
    const bucket = byOutlet.get(article.outletId);
    if (bucket) bucket.push(article.articleId);
    else byOutlet.set(article.outletId, [article.articleId]);
  }

  return [...byOutlet.entries()]
    .filter(([, articleIds]) => articleIds.length > 1)
    .map(([outletId, articleIds]) => ({ outletId, articleIds: articleIds.sort() }))
    .sort((left, right) => left.outletId.localeCompare(right.outletId));
}
