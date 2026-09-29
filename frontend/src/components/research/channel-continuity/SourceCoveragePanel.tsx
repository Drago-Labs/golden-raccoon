"use client";

import type { ContinuityCoverage, SourceCoverageRow } from "@/server/research/channel-continuity/schema";
import { StatusBadge } from "@/components/a11y/StatusBadge";

export function SourceCoveragePanel({
  rows,
  coverage,
}: {
  rows: SourceCoverageRow[];
  coverage: ContinuityCoverage;
}) {
  return (
    <div className="space-y-3" data-testid="source-coverage">
      <div className="rounded-xl border border-white/10 px-4 py-3 text-sm">
        <span className="flex flex-wrap items-center gap-2">
          <StatusBadge
            tone={coverage.state === "complete" ? "success" : coverage.state === "empty" ? "neutral" : "warning"}
          >
            {coverage.state}
          </StatusBadge>
          <span className="text-xs text-subtle">
            {coverage.analysableCount}/{coverage.observationCount} analysable · {coverage.eventCount} events
          </span>
        </span>
        <p className="mt-2 text-xs text-subtle">{coverage.note}</p>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/15 px-4 py-6 text-sm text-subtle">
          No sources contributed observations.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
            <caption className="py-2 text-left text-xs text-subtle">
              Source coverage, including failures and claim kinds. Canonical references stay distinct from ambiguous claims.
            </caption>
            <thead>
              <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-subtle">
                <th scope="col" className="py-2 pr-3">Source</th>
                <th scope="col" className="py-2 pr-3">Obs</th>
                <th scope="col" className="py-2 pr-3">Subjects</th>
                <th scope="col" className="py-2 pr-3">Failed</th>
                <th scope="col" className="py-2 pr-3">Missing archive</th>
                <th scope="col" className="py-2 pr-3">Blocked</th>
                <th scope="col" className="py-2 pr-3">Canonical / user / ambiguous</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.sourceLabel} className="border-b border-white/5 align-top">
                  <th scope="row" className="py-2 pr-3 text-xs font-medium">
                    {row.sourceLabel}
                  </th>
                  <td className="py-2 pr-3 text-xs tabular-nums">{row.observationCount}</td>
                  <td className="py-2 pr-3 text-xs tabular-nums">{row.subjectCount}</td>
                  <td className="py-2 pr-3 text-xs tabular-nums">{row.failedCount}</td>
                  <td className="py-2 pr-3 text-xs tabular-nums">{row.missingArchiveCount}</td>
                  <td className="py-2 pr-3 text-xs tabular-nums">{row.blockedUnsafeCount}</td>
                  <td className="py-2 pr-3 text-xs tabular-nums">
                    {row.canonicalReferenceCount} / {row.userSuppliedCount} / {row.ambiguousCount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
