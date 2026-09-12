/**
 * Claim chronology.
 *
 * Event time and publication time are separate facts and are kept separate. An
 * article that does not distinguish them is placed by publication time and
 * labelled as such; an article that carries neither is placed nowhere, with the
 * reason recorded, rather than being dropped or dated to "now".
 *
 * A publication timestamp in the future is a data problem, not a prediction, so
 * it is flagged and the entry keeps its uncertainty.
 */
import type { ArticleRef, ClaimTimelineEntry } from "./schema";

export type ChronologyResult = {
  timeline: ClaimTimelineEntry[];
  futureTimestampCount: number;
  missingPublishedAtCount: number;
};

export function buildChronology(articles: ArticleRef[], observedAtMs: number): ChronologyResult {
  let futureTimestampCount = 0;
  let missingPublishedAtCount = 0;

  const entries: ClaimTimelineEntry[] = articles.map((article) => {
    const isCorrection = article.correctionOf !== null;
    const eventMs = article.eventAt ? Date.parse(article.eventAt) : Number.NaN;
    const publishedMs = article.publishedAt ? Date.parse(article.publishedAt) : Number.NaN;

    const uncertainties: string[] = [];

    if (Number.isFinite(publishedMs) && publishedMs > observedAtMs) {
      futureTimestampCount += 1;
      uncertainties.push(
        "The publication timestamp is later than the moment this evidence was gathered. That is a data problem, not a scheduled future report, so this entry is not trusted for ordering.",
      );
    }

    if (article.languageCertainty === "undeclared") {
      uncertainties.push(
        "The article declares no language. A translated or transliterated headline may not order against the others as it appears to.",
      );
    }

    if (Number.isFinite(eventMs)) {
      if (Number.isFinite(publishedMs) && eventMs > publishedMs) {
        uncertainties.push("The stated event time is later than the publication time, so the two cannot both be right.");
      }

      return {
        articleId: article.articleId,
        kind: "event" as const,
        at: new Date(eventMs).toISOString(),
        uncertainty: uncertainties.length > 0 ? uncertainties.join(" ") : null,
        isCorrection,
      };
    }

    if (Number.isFinite(publishedMs)) {
      uncertainties.push(
        "This article does not distinguish when the event happened from when it was published, so it is placed by publication time.",
      );

      return {
        articleId: article.articleId,
        kind: "publication" as const,
        at: new Date(publishedMs).toISOString(),
        uncertainty: uncertainties.join(" "),
        isCorrection,
      };
    }

    missingPublishedAtCount += 1;

    return {
      articleId: article.articleId,
      kind: "unknown" as const,
      at: null,
      uncertainty:
        "This article carries neither an event time nor a readable publication time, so it cannot be placed in the chronology at all.",
      isCorrection,
    };
  });

  const dated = entries
    .filter((entry) => entry.at !== null)
    .sort((left, right) => Date.parse(left.at!) - Date.parse(right.at!) || left.articleId.localeCompare(right.articleId));
  const undated = entries
    .filter((entry) => entry.at === null)
    .sort((left, right) => left.articleId.localeCompare(right.articleId));

  return { timeline: [...dated, ...undated], futureTimestampCount, missingPublishedAtCount };
}
