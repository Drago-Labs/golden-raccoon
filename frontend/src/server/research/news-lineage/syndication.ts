/**
 * Story clustering.
 *
 * Reasons are ranked, and a cluster records the strongest one that applied, so
 * a reader can always tell documented syndication from a text-similarity guess.
 * Similar titles alone never collapse two articles: `near_duplicate_text`
 * requires substantial body overlap, not a matching headline.
 */
import { compareText } from "./fingerprints";
import { LINEAGE_LIMITS, type ArticleRef, type LineageMember, type LineageReason, type StoryCluster } from "./schema";

const REASON_STRENGTH: Record<LineageReason, number> = {
  same_canonical_url: 5,
  declared_syndication: 4,
  exact_text_match: 3,
  near_duplicate_text: 2,
  insufficient_text: 1,
  distinct_reporting: 0,
};

function bodyOf(article: ArticleRef): string {
  return `${article.title} ${article.summary ?? ""}`.trim();
}

type Link = { reason: LineageReason; similarity: number | null; detail: string };

/**
 * Decides whether two articles belong to one lineage, and why.
 *
 * The order of checks is the order of evidentiary strength. Declared
 * syndication is believed even when the texts differ, because a rewrite of a
 * wire story is still not independent reporting.
 */
export function linkArticles(left: ArticleRef, right: ArticleRef): Link {
  if (left.canonicalUrl && right.canonicalUrl && left.canonicalUrl === right.canonicalUrl) {
    return {
      reason: "same_canonical_url",
      similarity: 1,
      detail: "Both entries resolve to the same canonical URL, so they are one article, not two reports.",
    };
  }

  const syndicationDeclared =
    (left.syndicatedFrom && left.syndicatedFrom === right.outletId) ||
    (right.syndicatedFrom && right.syndicatedFrom === left.outletId) ||
    (left.syndicatedFrom && right.syndicatedFrom && left.syndicatedFrom === right.syndicatedFrom);

  if (syndicationDeclared) {
    return {
      reason: "declared_syndication",
      similarity: null,
      detail:
        "One article attributes the story to the other's outlet, or both attribute it to the same origin. Republishing is not independent reporting, whatever the wording differences.",
    };
  }

  const comparison = compareText(bodyOf(left), bodyOf(right), left.tokenCount, right.tokenCount);

  if (comparison.refusedReason) {
    return { reason: "insufficient_text", similarity: null, detail: comparison.refusedReason };
  }

  if (comparison.exact) {
    return {
      reason: "exact_text_match",
      similarity: 1,
      detail: "The comparable text of these two articles is identical after normalization.",
    };
  }

  if ((comparison.similarity ?? 0) >= LINEAGE_LIMITS.nearDuplicateSimilarity) {
    return {
      reason: "near_duplicate_text",
      similarity: comparison.similarity,
      detail: `Body overlap of ${comparison.similarity} is at or above the ${LINEAGE_LIMITS.nearDuplicateSimilarity} near-duplicate threshold. This is a text signal, weaker than documented attribution.`,
    };
  }

  return {
    reason: "distinct_reporting",
    similarity: comparison.similarity,
    detail: `Body overlap of ${comparison.similarity} is below the ${LINEAGE_LIMITS.nearDuplicateSimilarity} threshold. A similar headline alone is not grounds for collapsing two reports.`,
  };
}

/**
 * Groups articles into lineages with a union-find over the pairwise links.
 *
 * `insufficient_text` and `distinct_reporting` never join a cluster; they are
 * recorded so the reason a pair stayed apart is inspectable too.
 */
export function buildClusters(articles: ArticleRef[]): {
  clusters: StoryCluster[];
  rejectedLinks: Array<{ leftArticleId: string; rightArticleId: string } & Link>;
} {
  const parent = new Map<string, string>(articles.map((article) => [article.articleId, article.articleId]));

  function find(id: string): string {
    let current = id;
    while (parent.get(current) !== current) {
      const next = parent.get(current)!;
      parent.set(current, parent.get(next)!);
      current = next;
    }
    return current;
  }

  function union(left: string, right: string): void {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parent.set(leftRoot, rightRoot);
  }

  const accepted = new Map<string, { reason: LineageReason; similarity: number | null; detail: string; against: string }>();
  const rejectedLinks: Array<{ leftArticleId: string; rightArticleId: string } & Link> = [];

  for (let i = 0; i < articles.length; i += 1) {
    for (let j = i + 1; j < articles.length; j += 1) {
      const link = linkArticles(articles[i], articles[j]);

      if (link.reason === "distinct_reporting" || link.reason === "insufficient_text") {
        rejectedLinks.push({ leftArticleId: articles[i].articleId, rightArticleId: articles[j].articleId, ...link });
        continue;
      }

      union(articles[i].articleId, articles[j].articleId);

      for (const [member, against] of [
        [articles[j].articleId, articles[i].articleId],
        [articles[i].articleId, articles[j].articleId],
      ] as const) {
        const existing = accepted.get(member);
        if (!existing || REASON_STRENGTH[link.reason] > REASON_STRENGTH[existing.reason]) {
          accepted.set(member, { ...link, against });
        }
      }
    }
  }

  const grouped = new Map<string, ArticleRef[]>();

  for (const article of articles) {
    const root = find(article.articleId);
    const bucket = grouped.get(root);
    if (bucket) bucket.push(article);
    else grouped.set(root, [article]);
  }

  const clusters = [...grouped.entries()]
    .map(([root, members]) => {
      const ordered = [...members].sort((left, right) => {
        const leftTime = Date.parse(left.publishedAt ?? "");
        const rightTime = Date.parse(right.publishedAt ?? "");
        if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
          return leftTime - rightTime;
        }
        if (Number.isFinite(leftTime) !== Number.isFinite(rightTime)) {
          return Number.isFinite(leftTime) ? -1 : 1;
        }
        return left.articleId.localeCompare(right.articleId);
      });

      const lineageMembers: LineageMember[] = ordered.map((article) => {
        const link = accepted.get(article.articleId);

        return {
          articleId: article.articleId,
          reason: link?.reason ?? "distinct_reporting",
          matchedAgainstArticleId: link?.against ?? null,
          similarity: link?.similarity ?? null,
          detail: link?.detail ?? "This article was not matched to any other, so it stands as its own lineage.",
        };
      });

      const strongestReason = lineageMembers.reduce<LineageReason>(
        (strongest, member) => (REASON_STRENGTH[member.reason] > REASON_STRENGTH[strongest] ? member.reason : strongest),
        "distinct_reporting",
      );

      return { root, ordered, lineageMembers, strongestReason };
    })
    .sort((left, right) => left.root.localeCompare(right.root));

  return {
    clusters: clusters.map(({ root, ordered, lineageMembers, strongestReason }) => ({
      clusterId: `lineage:${root}`,
      primaryArticleId: ordered[0].articleId,
      members: lineageMembers,
      independentOutletCount: 0,
      syndicatedCopyCount: 0,
      unknownProvenanceCount: 0,
      strongestReason,
      headline: ordered[0].title,
      note: "",
    })),
    rejectedLinks,
  };
}
