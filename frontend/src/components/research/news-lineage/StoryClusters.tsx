"use client";

import { StatusBadge } from "@/components/a11y/StatusBadge";
import type { ArticleRef, CorroborationSummary, StoryCluster } from "@/server/research/news-lineage/schema";

const stateLabel = {
  corroborated: "Independently corroborated",
  single_outlet: "One outlet",
  syndication_only: "Syndication only",
  indeterminate: "Indeterminate",
} as const;

const stateTone = {
  corroborated: "success",
  single_outlet: "warning",
  syndication_only: "warning",
  indeterminate: "neutral",
} as const;

const reasonLabel = {
  same_canonical_url: "Same canonical URL",
  declared_syndication: "Declared syndication",
  exact_text_match: "Identical text",
  near_duplicate_text: "Near-duplicate text",
  distinct_reporting: "Distinct reporting",
  insufficient_text: "Too little text",
} as const;

/**
 * Story lineages, with the reason each one was formed.
 *
 * The independent-outlet count sits next to the member count deliberately: a
 * lineage with four articles and one independent outlet must not read as four
 * confirmations.
 */
export function StoryClusters({
  clusters,
  corroboration,
  articles,
  selectedClusterId,
  onSelect,
}: {
  clusters: StoryCluster[];
  corroboration: CorroborationSummary[];
  articles: ArticleRef[];
  selectedClusterId: string | null;
  onSelect: (clusterId: string) => void;
}) {
  const byId = new Map(articles.map((article) => [article.articleId, article]));
  const summaryById = new Map(corroboration.map((entry) => [entry.clusterId, entry]));

  if (clusters.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-white/15 px-4 py-6 text-sm text-subtle">
        No article evidence was supplied, so there is no lineage to show.
      </p>
    );
  }

  return (
    <ul className="space-y-3" data-testid="story-clusters">
      {clusters.map((cluster) => {
        const summary = summaryById.get(cluster.clusterId);
        const selected = cluster.clusterId === selectedClusterId;

        return (
          <li
            key={cluster.clusterId}
            className={`rounded-xl border p-4 ${selected ? "border-[var(--color-brand)]" : "border-white/10"}`}
          >
            <button
              type="button"
              onClick={() => onSelect(cluster.clusterId)}
              aria-expanded={selected}
              className="w-full text-left focus-visible:outline-2 focus-visible:outline-[var(--color-brand)]"
            >
              <span className="flex flex-wrap items-center gap-2">
                {summary ? <StatusBadge tone={stateTone[summary.state]}>{stateLabel[summary.state]}</StatusBadge> : null}
                <span className="text-sm font-medium">{cluster.headline}</span>
              </span>
              <span className="mt-1 block text-xs text-subtle">
                {cluster.members.length} article{cluster.members.length === 1 ? "" : "s"} ·{" "}
                {cluster.independentOutletCount} independent outlet
                {cluster.independentOutletCount === 1 ? "" : "s"} · {cluster.syndicatedCopyCount} cop
                {cluster.syndicatedCopyCount === 1 ? "y" : "ies"} · {cluster.unknownProvenanceCount} unknown
              </span>
            </button>

            <p className="mt-2 text-xs text-subtle">{summary?.note ?? cluster.note}</p>

            {selected ? (
              <ul className="mt-3 space-y-2">
                {cluster.members.map((member) => {
                  const article = byId.get(member.articleId);

                  return (
                    <li key={member.articleId} className="rounded-lg border border-white/10 px-3 py-2 text-xs">
                      <span className="flex flex-wrap items-center gap-2">
                        <StatusBadge tone={article?.role === "independent" ? "success" : "neutral"}>
                          {article?.role.replace(/_/g, " ") ?? "unknown"}
                        </StatusBadge>
                        <span className="font-medium">{article?.domain ?? "unknown outlet"}</span>
                        <span className="text-subtle">{reasonLabel[member.reason]}</span>
                        {member.similarity !== null ? (
                          <span className="text-subtle">similarity {member.similarity}</span>
                        ) : null}
                      </span>
                      <span className="mt-1 block">{article?.title}</span>
                      <span className="mt-1 block text-subtle">{member.detail}</span>
                      <span className="mt-1 block text-subtle">{article?.roleReason}</span>
                      {article?.originalId ? (
                        <span className="mt-1 block font-mono text-[11px] text-subtle">
                          provider id {article.originalId}
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
