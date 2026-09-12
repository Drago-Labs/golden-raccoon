/**
 * Versioned contract for story lineage and corroboration analysis.
 *
 * Syndication is the problem this feature exists for: the same wire story
 * republished across ten domains looks like ten independent confirmations. Every
 * clustering decision here carries a reason code, and corroboration is counted
 * conservatively — unknown provenance stays unknown, and a copy never raises the
 * count.
 */
import { z } from "zod";

export const LINEAGE_SCHEMA_VERSION = "news-lineage/2026-01" as const;

export const LINEAGE_LIMITS = {
  maxArticles: 300,
  maxRequestBytes: 1_048_576,
  /** Near-duplicate threshold on the shingle similarity, 0 to 1. */
  nearDuplicateSimilarity: 0.82,
  /** Below this many usable tokens, text is too sparse to judge similarity. */
  minTokensForSimilarity: 12,
} as const;

/**
 * Why two articles were placed in one lineage, or kept apart.
 *
 * Ordered strongest to weakest. A cluster records the strongest reason that
 * applied, so a reader can tell documented syndication from a text-similarity
 * guess.
 */
export type LineageReason =
  | "same_canonical_url"
  | "declared_syndication"
  | "exact_text_match"
  | "near_duplicate_text"
  | "distinct_reporting"
  | "insufficient_text";

/** How much weight a member adds to independent corroboration. */
export type CorroborationRole =
  | "independent"
  | "syndicated_copy"
  | "same_outlet_repeat"
  | "unknown_provenance";

export type LanguageCertainty = "declared" | "undeclared";

export type ArticleRef = {
  articleId: string;
  /** Original identifier from the provider, retained verbatim. */
  originalId: string | null;
  title: string;
  /** Sanitized; never rendered as markup. */
  summary: string | null;
  domain: string;
  outletId: string;
  canonicalUrl: string | null;
  /** Domain this article says it was syndicated from, when it declares one. */
  syndicatedFrom: string | null;
  publishedAt: string | null;
  /** When the event itself happened, when the article distinguishes it. */
  eventAt: string | null;
  language: string | null;
  languageCertainty: LanguageCertainty;
  /** True when the article declares itself a correction of another. */
  correctionOf: string | null;
  tokenCount: number;
  role: CorroborationRole;
  roleReason: string;
};

export type LineageMember = {
  articleId: string;
  reason: LineageReason;
  /** Article this member was matched against, when it was matched to one. */
  matchedAgainstArticleId: string | null;
  similarity: number | null;
  detail: string;
};

export type StoryCluster = {
  clusterId: string;
  /** Earliest-published member, used as the cluster's representative. */
  primaryArticleId: string;
  members: LineageMember[];
  /** Distinct outlets contributing an `independent` member. */
  independentOutletCount: number;
  syndicatedCopyCount: number;
  unknownProvenanceCount: number;
  /** Strongest reason any member was clustered by. */
  strongestReason: LineageReason;
  headline: string;
  note: string;
};

export type ClaimTimelineEntry = {
  articleId: string;
  /** `event` when the article distinguished event time, else `publication`. */
  kind: "event" | "publication" | "unknown";
  at: string | null;
  /** Why this entry cannot be placed confidently, when it cannot. */
  uncertainty: string | null;
  isCorrection: boolean;
};

export type CorroborationSummary = {
  clusterId: string;
  /**
   * Number of genuinely independent outlets. Never inflated by copies, repeats
   * from one outlet, or articles of unknown provenance.
   */
  independentReportCount: number;
  /** Members that could not be classified either way. */
  unknownProvenanceCount: number;
  /**
   * `corroborated` needs two or more independent outlets.
   * `single_outlet` is one outlet however many articles.
   * `syndication_only` is one origin republished.
   * `indeterminate` is dominated by unknown provenance.
   */
  state: "corroborated" | "single_outlet" | "syndication_only" | "indeterminate";
  note: string;
};

export type LineageCoverage = {
  state: "complete" | "partial" | "empty";
  articleCount: number;
  clusterCount: number;
  sparseTextCount: number;
  undeclaredLanguageCount: number;
  missingPublishedAtCount: number;
  futureTimestampCount: number;
  correctionCount: number;
  note: string;
};

export type LineageReport = {
  schemaVersion: typeof LINEAGE_SCHEMA_VERSION;
  observedAt: string;
  articles: ArticleRef[];
  clusters: StoryCluster[];
  corroboration: CorroborationSummary[];
  timeline: ClaimTimelineEntry[];
  coverage: LineageCoverage;
  /** This feature never changes a news score. */
  scoreUnchanged: true;
};

const articleSchema = z.object({
  articleId: z.string().trim().min(1).max(160),
  /** Provider's own identifier, retained so evidence can be traced back. */
  originalId: z.string().trim().max(200).optional(),
  title: z.string().trim().min(1).max(600),
  summary: z.string().max(4_000).optional(),
  url: z.string().trim().max(2_000).optional(),
  canonicalUrl: z.string().trim().max(2_000).optional(),
  /** Domain this article attributes the story to, when it declares one. */
  syndicatedFrom: z.string().trim().max(300).optional(),
  publishedAt: z.string().datetime({ offset: true }).optional(),
  eventAt: z.string().datetime({ offset: true }).optional(),
  language: z.string().trim().max(20).optional(),
  correctionOf: z.string().trim().max(160).optional(),
});

export const lineageRequestSchema = z.object({
  observedAt: z.string().datetime({ offset: true }),
  articles: z.array(articleSchema).max(LINEAGE_LIMITS.maxArticles),
});

export type LineageRequest = z.infer<typeof lineageRequestSchema>;
export type ArticleInput = z.infer<typeof articleSchema>;

export class LineageError extends Error {
  readonly code: string;
  readonly details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "LineageError";
    this.code = code;
    this.details = details;
  }
}
