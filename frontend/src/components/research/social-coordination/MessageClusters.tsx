"use client";

import { StatusBadge } from "@/components/a11y/StatusBadge";
import type { MessageCluster, ObservationRef } from "@/server/research/social-coordination/schema";

/**
 * Repeated-text clusters with their supporting observations.
 *
 * Text is rendered as text — the sanitizer already stripped markup, and React
 * escapes what is left, so a hostile message cannot become markup here.
 */
export function MessageClusters({
  clusters,
  observations,
  expandedClusterId,
  onToggle,
}: {
  clusters: MessageCluster[];
  observations: ObservationRef[];
  expandedClusterId: string | null;
  onToggle: (clusterId: string) => void;
}) {
  const byId = new Map(observations.map((observation) => [observation.observationId, observation]));

  if (clusters.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-white/15 px-4 py-6 text-sm text-subtle">
        No group of messages met the repetition threshold. Many accounts describing the same event in their own words is
        what an organic conversation looks like.
      </p>
    );
  }

  return (
    <ul className="space-y-3" data-testid="message-clusters">
      {clusters.map((cluster) => {
        const expanded = cluster.clusterId === expandedClusterId;

        return (
          <li key={cluster.clusterId} className="rounded-xl border border-white/10 p-4">
            <button
              type="button"
              onClick={() => onToggle(cluster.clusterId)}
              aria-expanded={expanded}
              className="w-full text-left focus-visible:outline-2 focus-visible:outline-[var(--color-brand)]"
            >
              <span className="flex flex-wrap items-center gap-2">
                <StatusBadge tone="warning">
                  {cluster.matchKind === "identical_text" ? "Identical text" : "Near-identical text"}
                </StatusBadge>
                <span className="text-xs text-subtle">
                  {cluster.observationIds.length} messages · {cluster.distinctAuthorCount} distinct author
                  {cluster.distinctAuthorCount === 1 ? "" : "s"}
                  {cluster.spanSeconds !== null ? ` · ${cluster.spanSeconds}s span` : ""}
                </span>
              </span>
              <span className="mt-2 block text-sm">{cluster.sampleText}</span>
            </button>

            <p className="mt-2 text-xs text-subtle">{cluster.note}</p>

            {expanded ? (
              <ul className="mt-3 space-y-1 text-xs">
                {cluster.observationIds.map((observationId) => {
                  const observation = byId.get(observationId);

                  return (
                    <li key={observationId} className="rounded border border-white/10 px-2 py-1">
                      <span className="font-mono text-[11px] text-subtle">{observation?.authorKey ?? "unknown"}</span>
                      <span className="ml-2 text-subtle">{observation?.postedAt ?? "no timestamp"}</span>
                      <span className="mt-1 block">{observation?.text}</span>
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
