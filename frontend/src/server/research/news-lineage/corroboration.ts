/**
 * Conservative corroboration counting.
 *
 * Three rules, each of which lowers a count rather than raising it:
 *
 * 1. A copy never adds corroboration. An article clustered by canonical URL,
 *    declared syndication or identical text is a copy.
 * 2. One outlet publishing twice is one outlet.
 * 3. Unknown provenance stays unknown. An article that could not be classified
 *    is counted in its own bucket, never assumed independent.
 */
import { isSparse } from "./articleAdapter";
import type { ArticleRef, CorroborationRole, CorroborationSummary, StoryCluster } from "./schema";

const COPY_REASONS = new Set(["same_canonical_url", "declared_syndication", "exact_text_match", "near_duplicate_text"]);

/**
 * Assigns each article its role inside its cluster, and returns the articles
 * with roles filled in.
 */
export function assignRoles(clusters: StoryCluster[], articles: ArticleRef[]): ArticleRef[] {
  const byId = new Map(articles.map((article) => [article.articleId, article]));
  const updated = new Map<string, { role: CorroborationRole; roleReason: string }>();

  for (const cluster of clusters) {
    const countedOutlets = new Set<string>();

    cluster.members.forEach((member, index) => {
      const article = byId.get(member.articleId);
      if (!article) return;

      if (isSparse(article) || member.reason === "insufficient_text") {
        updated.set(article.articleId, {
          role: "unknown_provenance",
          roleReason:
            "There is too little text to tell whether this repeats another report. Unknown provenance is counted as unknown, never as independent.",
        });
        return;
      }

      if (article.syndicatedFrom && article.syndicatedFrom !== article.outletId) {
        updated.set(article.articleId, {
          role: "syndicated_copy",
          roleReason: `This article attributes the story to ${article.syndicatedFrom}. Republishing is not independent reporting, however many domains carry it.`,
        });
        return;
      }

      if (index === 0) {
        countedOutlets.add(article.outletId);
        updated.set(article.articleId, {
          role: "independent",
          roleReason: `${article.outletId} is the earliest contributor to this lineage and attributes the story to no one else.`,
        });
        return;
      }

      if (countedOutlets.has(article.outletId)) {
        updated.set(article.articleId, {
          role: "same_outlet_repeat",
          roleReason: `${article.outletId} already contributed to this lineage. One outlet publishing twice is one outlet.`,
        });
        return;
      }

      if (COPY_REASONS.has(member.reason)) {
        updated.set(article.articleId, {
          role: "syndicated_copy",
          roleReason: `Clustered by ${member.reason.replace(/_/g, " ")}. A copy does not add corroboration, however many domains carry it.`,
        });
        return;
      }

      countedOutlets.add(article.outletId);
      updated.set(article.articleId, {
        role: "independent",
        roleReason: `${article.outletId} is the first contributor from this outlet in this lineage, with no copy relationship to another member.`,
      });
    });
  }

  return articles.map((article) => {
    const change = updated.get(article.articleId);
    return change ? { ...article, ...change } : article;
  });
}

export function summarizeCorroboration(cluster: StoryCluster, articles: ArticleRef[]): CorroborationSummary {
  const byId = new Map(articles.map((article) => [article.articleId, article]));
  const members = cluster.members.map((member) => byId.get(member.articleId)).filter((article): article is ArticleRef => Boolean(article));

  const independentOutlets = new Set(
    members.filter((article) => article.role === "independent").map((article) => article.outletId),
  );
  const copies = members.filter((article) => article.role === "syndicated_copy").length;
  const unknown = members.filter((article) => article.role === "unknown_provenance").length;

  const base = {
    clusterId: cluster.clusterId,
    independentReportCount: independentOutlets.size,
    unknownProvenanceCount: unknown,
  };

  if (unknown > 0 && independentOutlets.size < 2) {
    return {
      ...base,
      state: "indeterminate",
      note: `${unknown} article${unknown === 1 ? "" : "s"} in this lineage could not be placed. With only ${independentOutlets.size} confirmed independent outlet${independentOutlets.size === 1 ? "" : "s"}, corroboration cannot be determined either way.`,
    };
  }

  if (independentOutlets.size >= 2) {
    return {
      ...base,
      state: "corroborated",
      note: `${independentOutlets.size} distinct outlets reported this independently.${copies > 0 ? ` ${copies} further article${copies === 1 ? " is a copy" : "s are copies"} and add nothing.` : ""}`,
    };
  }

  if (copies > 0) {
    return {
      ...base,
      state: "syndication_only",
      note: `This lineage is one origin republished ${copies} time${copies === 1 ? "" : "s"}. It is a single report, not ${copies + 1} confirmations.`,
    };
  }

  return {
    ...base,
    state: "single_outlet",
    note: "Only one outlet reported this. That is not evidence against it; it is an absence of corroboration.",
  };
}

/** Fills the per-cluster counts and note from the assigned roles. */
export function decorateClusters(clusters: StoryCluster[], articles: ArticleRef[]): StoryCluster[] {
  const byId = new Map(articles.map((article) => [article.articleId, article]));

  return clusters.map((cluster) => {
    const members = cluster.members
      .map((member) => byId.get(member.articleId))
      .filter((article): article is ArticleRef => Boolean(article));

    const summary = summarizeCorroboration(cluster, articles);

    return {
      ...cluster,
      independentOutletCount: summary.independentReportCount,
      syndicatedCopyCount: members.filter((article) => article.role === "syndicated_copy").length,
      unknownProvenanceCount: summary.unknownProvenanceCount,
      note: summary.note,
    };
  });
}
