"use client";

import type { SourceDeltaItem, SourceDeltaResult } from "@/server/research/report-comparison/schema";

type Props = {
  sources: SourceDeltaResult;
};

function getSourceStatusBadgeClass(status: SourceDeltaItem["status"], isDisappeared: boolean): string {
  if (isDisappeared) {
    return "bg-red-500/20 text-red-300 border-red-500/40";
  }
  switch (status) {
    case "reconnected":
      return "bg-emerald-400/10 text-emerald-400 border-emerald-500/20";
    case "fresh":
      return "bg-emerald-400/10 text-emerald-400 border-emerald-500/20";
    case "added":
      return "bg-blue-400/10 text-blue-400 border-blue-500/20";
    case "stale":
      return "bg-amber-400/10 text-amber-300 border-amber-500/20";
    case "removed":
      return "bg-white/10 text-white/60 border-white/15";
    default:
      return "bg-white/5 text-white/50 border-white/10";
  }
}

/**
 * Renders evidence source transitions, telemetry freshness, and critical alerts
 * when telemetry sources disappear between observation intervals.
 */
export function SourceChanges({ sources }: Props) {
  const hasDisappeared = sources.summary.disappearedCount > 0;

  return (
    <div className="space-y-6">
      {hasDisappeared ? (
        <div className="rounded-2xl border border-red-500/40 bg-red-950/30 p-6 text-red-200">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-400 animate-pulse" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-red-300">
              Critical Telemetry Warning: Disappeared Evidence Sources ({sources.summary.disappearedCount})
            </h3>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-red-200/90 font-medium">
            One or more telemetry sources connected during baseline observation are absent or unavailable in the target observation.
            <strong> A disappearing source must never be interpreted as a resolved risk.</strong> Absence of evidence is not evidence of absence.
          </p>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0d131f]/80">
        <div className="border-b border-white/10 p-6">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-white/90">
            Telemetry Evidence Sources & Freshness Transitions
          </h3>
          <p className="mt-1 text-xs text-white/40">
            Baseline connected: {sources.summary.connectedBaseSources}/{sources.summary.totalBaseSources} | Target connected: {sources.summary.connectedTargetSources}/{sources.summary.totalTargetSources}
          </p>
        </div>

        <table className="w-full text-left text-sm" aria-label="Evidence sources comparison">
          <thead className="border-b border-white/10 bg-white/[0.02] text-xs font-semibold uppercase tracking-wider text-white/40">
            <tr>
              <th scope="col" className="px-6 py-4">Evidence Source</th>
              <th scope="col" className="px-6 py-4">Baseline Status</th>
              <th scope="col" className="px-6 py-4">Target Status</th>
              <th scope="col" className="px-6 py-4">Freshness / Transition</th>
              <th scope="col" className="px-6 py-4 text-right">Classification</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5 font-mono text-xs">
            {sources.items.map((item) => (
              <tr key={item.label} className={item.isDisappearedRiskEvidence ? "bg-red-500/[0.04]" : undefined}>
                <td className="px-6 py-4 font-sans font-medium text-white/90">
                  {item.label}
                  {item.note ? (
                    <p className="mt-1 font-sans text-[11px] font-normal text-red-300/80">
                      {item.note}
                    </p>
                  ) : null}
                </td>
                <td className="px-6 py-4 text-white/70">
                  <div>{item.baseStatus ?? "missing"}</div>
                  {item.baseCheckedAt ? (
                    <div className="text-[10px] text-white/40">{new Date(item.baseCheckedAt).toLocaleTimeString()}</div>
                  ) : null}
                </td>
                <td className="px-6 py-4 text-white/90">
                  <div>{item.targetStatus ?? "missing"}</div>
                  {item.targetCheckedAt ? (
                    <div className="text-[10px] text-white/40">{new Date(item.targetCheckedAt).toLocaleTimeString()}</div>
                  ) : null}
                </td>
                <td className="px-6 py-4 text-white/70 font-sans">
                  {item.freshnessDeltaSeconds !== undefined ? (
                    item.freshnessDeltaSeconds > 0 ? (
                      <span className="text-emerald-400">+{item.freshnessDeltaSeconds}s elapsed</span>
                    ) : item.freshnessDeltaSeconds < 0 ? (
                      <span className="text-amber-400">{item.freshnessDeltaSeconds}s older</span>
                    ) : (
                      <span className="text-white/40">Same timestamp</span>
                    )
                  ) : (
                    <span className="text-white/40">N/A</span>
                  )}
                </td>
                <td className="px-6 py-4 text-right">
                  <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase ${getSourceStatusBadgeClass(item.status, item.isDisappearedRiskEvidence)}`}>
                    {item.isDisappearedRiskEvidence ? "Disappeared Signal" : item.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
