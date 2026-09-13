"use client";

import { StatusBadge } from "@/components/a11y/StatusBadge";
import type { SourceChange } from "@/server/research/report-comparison/schema";

/**
 * Evidence-source differences.
 *
 * The `evidenceLost` rows carry an explicit warning, because the one reading a
 * comparison is most likely to misread a disappeared source as good news.
 */
export function SourceChanges({
  sources,
  leftLabel,
  rightLabel,
  showUnchanged,
}: {
  sources: SourceChange[];
  leftLabel: string;
  rightLabel: string;
  showUnchanged: boolean;
}) {
  const visible = showUnchanged ? sources : sources.filter((source) => source.status !== "unchanged");
  const lost = sources.filter((source) => source.evidenceLost);

  return (
    <div className="space-y-3">
      {lost.length > 0 ? (
        <p
          role="note"
          className="rounded-xl border border-[#d9a441]/35 bg-[#d9a441]/10 px-4 py-3 text-xs text-[#f2c86d]"
          data-testid="evidence-lost-notice"
        >
          {lost.length} source{lost.length === 1 ? "" : "s"} stopped being observable between these two snapshots. Reduced
          coverage is not the same as a resolved risk.
        </p>
      ) : null}

      {visible.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/15 px-4 py-6 text-sm text-subtle">
          {sources.length === 0 ? "Neither snapshot lists an evidence source." : "No evidence source differs between the two observations."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
            <caption className="sr-only">Evidence source differences between the two observations</caption>
            <thead>
              <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-subtle">
                <th scope="col" className="py-2 pr-3">Source</th>
                <th scope="col" className="py-2 pr-3">{leftLabel}</th>
                <th scope="col" className="py-2 pr-3">{rightLabel}</th>
                <th scope="col" className="py-2 pr-3">Change</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((source) => (
                <tr key={source.label} className="border-b border-white/5 align-top">
                  <th scope="row" className="py-2 pr-3 font-medium">{source.label}</th>
                  <td className="py-2 pr-3 text-xs">
                    {source.leftStatus ?? <span className="text-subtle">Absent</span>}
                    {source.leftCheckedAt ? <span className="block text-subtle">{source.leftCheckedAt}</span> : null}
                  </td>
                  <td className="py-2 pr-3 text-xs">
                    {source.rightStatus ?? <span className="text-subtle">Absent</span>}
                    {source.rightCheckedAt ? <span className="block text-subtle">{source.rightCheckedAt}</span> : null}
                  </td>
                  <td className="py-2 pr-3 text-xs">
                    <StatusBadge tone={source.evidenceLost ? "warning" : source.status === "unchanged" ? "neutral" : "success"}>
                      {source.evidenceLost ? "Evidence lost" : source.status}
                    </StatusBadge>
                    <span className="mt-1 block text-subtle">{source.note}</span>
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
