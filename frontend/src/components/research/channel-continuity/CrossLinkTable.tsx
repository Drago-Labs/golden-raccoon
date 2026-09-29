"use client";

import { StatusBadge } from "@/components/a11y/StatusBadge";
import type { CrossLinkEdge } from "@/server/research/channel-continuity/schema";

/**
 * Cross-link graph rendered as an accessible table.
 *
 * URLs are shown as text, never as navigable links, so a hostile target cannot
 * be followed from this inspector.
 */
export function CrossLinkTable({ edges }: { edges: CrossLinkEdge[] }) {
  if (edges.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-white/15 px-4 py-6 text-sm text-subtle">
        No cross-links were recorded on the supplied observations.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto" data-testid="cross-link-table">
      <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
        <caption className="py-2 text-left text-xs text-subtle">
          Cross-links observed between channels. Targets are text only and are never fetched from this page.
        </caption>
        <thead>
          <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-subtle">
            <th scope="col" className="py-2 pr-3">From</th>
            <th scope="col" className="py-2 pr-3">To</th>
            <th scope="col" className="py-2 pr-3">Hostname</th>
            <th scope="col" className="py-2 pr-3">First seen</th>
            <th scope="col" className="py-2 pr-3">Count</th>
            <th scope="col" className="py-2 pr-3">Safety</th>
          </tr>
        </thead>
        <tbody>
          {edges.map((edge) => (
            <tr key={edge.edgeId} className="border-b border-white/5 align-top">
              <th scope="row" className="py-2 pr-3 font-mono text-xs font-medium">
                {edge.fromUrl ?? "(no url)"}
              </th>
              <td className="py-2 pr-3 font-mono text-xs">{edge.toUrl}</td>
              <td className="py-2 pr-3 text-xs">{edge.toHostname ?? "—"}</td>
              <td className="py-2 pr-3 font-mono text-xs">{edge.firstSeenAt ?? "Undated"}</td>
              <td className="py-2 pr-3 text-xs tabular-nums">{edge.observationCount}</td>
              <td className="py-2 pr-3 text-xs">
                {edge.blocked ? <StatusBadge tone="warning">Blocked</StatusBadge> : <span className="text-subtle">Recorded</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
