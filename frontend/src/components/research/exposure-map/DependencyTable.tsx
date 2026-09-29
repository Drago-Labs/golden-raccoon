"use client";

import { StatusBadge } from "@/components/a11y/StatusBadge";
import { fromMicroUsd, type ExposureEdge } from "@/server/research/exposure-map/schema";

const statusLabel: Record<ExposureEdge["status"], string> = {
  applied: "Counted",
  dropped_cycle: "Cycle — not counted",
  dropped_depth: "Depth bound — not counted",
  dropped_duplicate: "Duplicate — counted once",
};

/**
 * The keyboard-navigable equivalent of the graph.
 *
 * Every relationship the diagram draws is a row here, including the dropped
 * ones, so nothing is reachable only by looking at the picture.
 */
export function DependencyTable({
  edges,
  labelFor,
}: {
  edges: ExposureEdge[];
  labelFor: (nodeId: string) => { label: string; totalMicroUsd: number } | null;
}) {
  if (edges.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-white/15 px-4 py-6 text-sm text-subtle">
        No relationship was declared for this portfolio, so there is no dependency to list.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[44rem] border-collapse text-left text-sm">
        <caption className="sr-only">
          Every declared relationship, including those excluded from attribution. This table carries the same information
          as the diagram above.
        </caption>
        <thead>
          <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-subtle">
            <th scope="col" className="py-2 pr-3">From</th>
            <th scope="col" className="py-2 pr-3">Depends on</th>
            <th scope="col" className="py-2 pr-3">Kind</th>
            <th scope="col" className="py-2 pr-3">Provenance</th>
            <th scope="col" className="py-2 pr-3">Attribution</th>
          </tr>
        </thead>
        <tbody>
          {edges.map((edge) => {
            const from = labelFor(edge.from);
            const to = labelFor(edge.to);

            return (
              <tr key={`${edge.from}-${edge.to}-${edge.kind}-${edge.status}`} className="border-b border-white/5 align-top">
                <th scope="row" className="py-2 pr-3 font-medium">
                  {from?.label ?? edge.from}
                  <span className="mt-1 block break-all font-mono text-[11px] font-normal text-subtle">{edge.from}</span>
                </th>
                <td className="py-2 pr-3 text-xs">
                  {to?.label ?? edge.to}
                  {to ? (
                    <span className="block text-subtle tabular-nums">
                      ${fromMicroUsd(to.totalMicroUsd).toLocaleString("en-US", { maximumFractionDigits: 2 })}
                    </span>
                  ) : null}
                </td>
                <td className="py-2 pr-3 text-xs">{edge.kind}</td>
                <td className="py-2 pr-3 text-xs">
                  {edge.provenance.replace(/_/g, " ")}
                  {edge.observedAt ? <span className="block text-subtle">{edge.observedAt}</span> : null}
                </td>
                <td className="py-2 pr-3 text-xs">
                  <StatusBadge tone={edge.status === "applied" ? "success" : "warning"}>
                    {statusLabel[edge.status]}
                  </StatusBadge>
                  <span className="mt-1 block text-subtle">{edge.note}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
