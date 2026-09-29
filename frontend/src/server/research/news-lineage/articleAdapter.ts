/**
 * Local adaptation of article evidence.
 *
 * Text is sanitized here and never carries markup onward - an article title is
 * attacker-influenced input, so it is stripped of tags and of the invisible
 * characters that can hide or reorder what a reader sees. Original provider
 * identifiers are retained verbatim so a lineage decision can always be traced
 * back to its evidence.
 */
import { canonicalizeUrl, outletIdFor } from "./canonicalLinks";
import { tokenize } from "./fingerprints";
import { LINEAGE_LIMITS, type ArticleInput, type ArticleRef, type LanguageCertainty } from "./schema";

/**
 * Zero-width, bidirectional-override and control characters. These are
 * invisible but can reverse or conceal displayed text, so they are removed
 * rather than escaped.
 */
const INVISIBLE_CHARACTERS = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g;

export function sanitizeText(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(INVISIBLE_CHARACTERS, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function adaptArticle(input: ArticleInput): ArticleRef {
  const title = sanitizeText(input.title);
  const summary = input.summary ? sanitizeText(input.summary) : null;
  const canonicalUrl = canonicalizeUrl(input.canonicalUrl ?? input.url ?? null);
  const domain = outletIdFor(canonicalUrl ?? input.url ?? null) ?? "unknown";
  const language = input.language?.trim() || null;
  const languageCertainty: LanguageCertainty = language ? "declared" : "undeclared";

  return {
    articleId: input.articleId,
    originalId: input.originalId ?? null,
    title,
    summary,
    domain,
    outletId: domain,
    canonicalUrl,
    syndicatedFrom: input.syndicatedFrom ? (outletIdFor(input.syndicatedFrom) ?? input.syndicatedFrom.trim()) : null,
    publishedAt: input.publishedAt ?? null,
    eventAt: input.eventAt ?? null,
    language,
    languageCertainty,
    correctionOf: input.correctionOf ?? null,
    tokenCount: tokenize(`${title} ${summary ?? ""}`).length,
    // Roles are assigned after clustering; this is the starting point.
    role: "unknown_provenance",
    roleReason: "Provenance has not been determined yet.",
  };
}

/** True when an article carries too little text to judge similarity. */
export function isSparse(article: ArticleRef): boolean {
  return article.tokenCount < LINEAGE_LIMITS.minTokensForSimilarity;
}
