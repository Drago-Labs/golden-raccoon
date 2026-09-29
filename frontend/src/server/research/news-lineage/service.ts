/**
 * Public entry point for story lineage analysis.
 *
 * `analyseLineage` is pure. It reads article evidence the caller already holds
 * and returns lineage. It changes no news score, fetches no article, and adds
 * no confirmation guarantee — only inspectable structure over existing evidence.
 */
import { adaptArticle, isSparse } from "./articleAdapter";
import { buildChronology } from "./chronology";
import { findCorrections } from "./claims";
import { assignRoles, decorateClusters, summarizeCorroboration } from "./corroboration";
import { buildClusters } from "./syndication";
import {
  LINEAGE_SCHEMA_VERSION,
  LineageError,
  lineageRequestSchema,
  type ArticleRef,
  type LineageCoverage,
  type LineageReport,
} from "./schema";

function buildCoverage(
  articles: ArticleRef[],
  clusterCount: number,
  chronology: { futureTimestampCount: number; missingPublishedAtCount: number },
  correctionCount: number,
): LineageCoverage {
  if (articles.length === 0) {
    return {
      state: "empty",
      articleCount: 0,
      clusterCount: 0,
      sparseTextCount: 0,
      undeclaredLanguageCount: 0,
      missingPublishedAtCount: 0,
      futureTimestampCount: 0,
      correctionCount: 0,
      note: "No article evidence was supplied, so there is no lineage to build.",
    };
  }

  const sparseTextCount = articles.filter(isSparse).length;
  const undeclaredLanguageCount = articles.filter((article) => article.languageCertainty === "undeclared").length;

  const reasons: string[] = [];
  if (sparseTextCount > 0) reasons.push(`${sparseTextCount} article${sparseTextCount === 1 ? " carries" : "s carry"} too little text to compare`);
  if (undeclaredLanguageCount > 0) reasons.push(`${undeclaredLanguageCount} declare${undeclaredLanguageCount === 1 ? "s" : ""} no language`);
  if (chronology.missingPublishedAtCount > 0) reasons.push(`${chronology.missingPublishedAtCount} cannot be placed in time`);
  if (chronology.futureTimestampCount > 0) reasons.push(`${chronology.futureTimestampCount} carr${chronology.futureTimestampCount === 1 ? "ies" : "y"} a future timestamp`);

  return {
    state: reasons.length === 0 ? "complete" : "partial",
    articleCount: articles.length,
    clusterCount,
    sparseTextCount,
    undeclaredLanguageCount,
    missingPublishedAtCount: chronology.missingPublishedAtCount,
    futureTimestampCount: chronology.futureTimestampCount,
    correctionCount,
    note:
      reasons.length === 0
        ? `All ${articles.length} articles carry enough text, a declared language and a readable time, across ${clusterCount} lineage${clusterCount === 1 ? "" : "s"}.`
        : `Read this lineage as partial: ${reasons.join("; ")}. Uncertainty is preserved rather than resolved by guessing.`,
  };
}

export function analyseLineage(input: unknown): LineageReport {
  const parsed = lineageRequestSchema.safeParse(input);

  if (!parsed.success) {
    throw new LineageError("invalid_request", "The lineage request could not be read.", parsed.error.flatten());
  }

  const observedAtMs = Date.parse(parsed.data.observedAt);

  if (!Number.isFinite(observedAtMs)) {
    throw new LineageError("invalid_observed_at", "The observation time could not be read.");
  }

  const adapted = parsed.data.articles.map(adaptArticle);
  const { clusters: rawClusters } = buildClusters(adapted);
  const articles = assignRoles(rawClusters, adapted);
  const clusters = decorateClusters(rawClusters, articles);
  const corroboration = clusters.map((cluster) => summarizeCorroboration(cluster, articles));
  const chronology = buildChronology(articles, observedAtMs);
  const corrections = findCorrections(articles);

  return {
    schemaVersion: LINEAGE_SCHEMA_VERSION,
    observedAt: new Date(observedAtMs).toISOString(),
    articles,
    clusters,
    corroboration,
    timeline: chronology.timeline,
    coverage: buildCoverage(articles, clusters.length, chronology, corrections.length),
    scoreUnchanged: true,
  };
}

export { LineageError } from "./schema";
export type { LineageReport } from "./schema";
