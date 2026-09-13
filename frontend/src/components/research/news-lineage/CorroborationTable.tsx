"use client";

import { StatusBadge } from "@/components/a11y/StatusBadge";
import type { CorroborationSummary, StoryCluster } from "@/server/research/news-lineage/schema";

const stateLabel = {
  corroborated: "Corroborated",
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

/**
 * Independent reporting per lineage.
 *
 * The article count and the independent-outlet count are separate columns on
 * purpose: their divergence is the whole point of the feature.
 */
export function CorroborationTable({
  corroboration,
  clusters,
}: {
  corroboration: CorroborationSummary[];
  clusters: StoryCluster[];
}) {
  const clusterById = new Map(clusters.map((cluster) => [cluster.clusterId, cluster]));

  if (corroboration.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-white/15 px-4 py-6 text-sm text-subtle">
        There is no lineage to assess for independent reporting.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[42rem] border-collapse text-left text-sm">
        <caption className="py-2 text-left text-xs text-subtle">
          Independent reporting per lineage. A copy never raises the independent count, and unknown provenance is never
          assumed independent.
        </caption>
        <thead>
          <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-subtle">
            <th scope="col" className="py-2 pr-3">Story</th>
            <th scope="col" className="py-2 pr-3">Articles</th>
            <th scope="col" className="py-2 pr-3">Independent outlets</th>
            <th scope="col" className="py-2 pr-3">Unknown provenance</th>
            <th scope="col" className="py-2 pr-3">Assessment</th>
          </tr>
        </thead>
        <tbody>
          {corroboration.map((summary) => {
            const cluster = clusterById.get(summary.clusterId);

            return (
              <tr key={summary.clusterId} className="border-b border-white/5 align-top">
                <th scope="row" className="py-2 pr-3 font-medium">
                  {cluster?.headline ?? summary.clusterId}
                </th>
                <td className="py-2 pr-3 text-xs tabular-nums">{cluster?.members.length ?? 0}</td>
                <td className="py-2 pr-3 text-xs tabular-nums">{summary.independentReportCount}</td>
                <td className="py-2 pr-3 text-xs tabular-nums">{summary.unknownProvenanceCount}</td>
                <td className="py-2 pr-3 text-xs">
                  <StatusBadge tone={stateTone[summary.state]}>{stateLabel[summary.state]}</StatusBadge>
                  <span className="mt-1 block text-subtle">{summary.note}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
