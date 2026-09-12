"use client";

import { useState, useId } from "react";
import type {
  FactorDeltaItem,
  FactorMatchResult,
  ImpactDeltaState,
} from "@/server/research/report-comparison/schema";

type Props = {
  factors: FactorMatchResult;
};

type FilterCategory = "all" | "critical" | "changed" | "added" | "removed" | "ambiguous";

function formatImpactState(state: ImpactDeltaState, base?: number | null, target?: number | null, delta?: number | null): string {
  switch (state) {
    case "numeric_delta":
      return delta !== null && delta !== undefined ? (delta > 0 ? `+${delta}` : `${delta}`) : "Delta";
    case "unknown_to_known":
      return `Unknown → ${target ?? "Recorded"}`;
    case "known_to_unknown":
      return `${base ?? "Recorded"} → Unknown`;
    case "both_unknown":
      return "Descriptive";
    case "unchanged":
      return "0";
  }
}

function getStatusBadgeClass(status: FactorDeltaItem["status"]): string {
  switch (status) {
    case "added":
      return "bg-emerald-400/10 text-emerald-400 border-emerald-500/20";
    case "removed":
      return "bg-rose-400/10 text-rose-400 border-rose-500/20";
    case "changed":
      return "bg-amber-400/10 text-amber-300 border-amber-500/20";
    case "ambiguous":
      return "bg-purple-400/10 text-purple-300 border-purple-500/20";
    case "unchanged":
      return "bg-white/5 text-white/50 border-white/10";
  }
}

/**
 * Visual factor comparison panel displaying classified added, removed, changed,
 * and ambiguous risk factors while highlighting changed critical factors with both source values.
 */
export function FactorChanges({ factors }: Props) {
  const [filter, setFilter] = useState<FilterCategory>("all");
  const filterGroupLabelId = useId();

  const criticalItems = factors.items.filter((item) => item.critical);
  const criticalChangedItems = factors.items.filter((item) => item.critical && item.status === "changed");

  const filteredItems = factors.items.filter((item) => {
    switch (filter) {
      case "critical":
        return item.critical;
      case "changed":
        return item.status === "changed";
      case "added":
        return item.status === "added";
      case "removed":
        return item.status === "removed";
      case "ambiguous":
        return item.status === "ambiguous";
      default:
        return true;
    }
  });

  return (
    <div className="space-y-6">
      {criticalChangedItems.length > 0 ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-950/20 p-6">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-red-400" />
            <h3 className="text-sm font-semibold uppercase tracking-wider text-red-300">
              Critical Risk Factor Modifications ({criticalChangedItems.length})
            </h3>
          </div>
          <p className="mt-1 text-xs text-red-200/60">
            Critical factors altered between snapshot observations. Both baseline and target source observations are detailed below.
          </p>

          <div className="mt-4 space-y-4">
            {criticalChangedItems.map((item) => (
              <div
                key={`critical-${item.key}`}
                className="rounded-xl border border-red-500/20 bg-black/40 p-4 text-xs font-sans text-white/80"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-red-200">{item.label}</span>
                  <span className="rounded-md border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-300">
                    Critical Factor
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
                    <span className="text-[11px] font-medium text-white/40">Baseline Observation:</span>
                    <p className="mt-1 text-white/90">{item.baseDetail ?? "No detail recorded"}</p>
                    <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-white/50">
                      <span>Severity: <strong className="text-white/80">{item.severity.base ?? "Unknown"}</strong></span>
                      <span>Impact: <strong className="text-white/80">{item.impact.base ?? "None"}</strong></span>
                      {item.sourceLabels?.base ? <span>Source: <strong className="text-white/80">{item.sourceLabels.base}</strong></span> : null}
                    </div>
                  </div>

                  <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
                    <span className="text-[11px] font-medium text-white/40">Target Observation:</span>
                    <p className="mt-1 font-semibold text-white/95">{item.targetDetail ?? "No detail recorded"}</p>
                    <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-white/50">
                      <span>Severity: <strong className="text-white/80">{item.severity.target ?? "Unknown"}</strong></span>
                      <span>Impact: <strong className="text-white/80">{item.impact.target ?? "None"}</strong></span>
                      {item.sourceLabels?.target ? <span>Source: <strong className="text-white/80">{item.sourceLabels.target}</strong></span> : null}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="rounded-2xl border border-white/10 bg-[#0d131f]/80 p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-white/90">
              Factor Semantic Reconciliations
            </h3>
            <p className="text-xs text-white/40">
              Factors matched by semantic identity rather than array position. Reordered inputs produce no delta.
            </p>
          </div>

          <div role="group" aria-labelledby={filterGroupLabelId} className="flex flex-wrap gap-1 text-xs">
            <span id={filterGroupLabelId} className="sr-only">Filter factors</span>
            <button
              type="button"
              onClick={() => setFilter("all")}
              className={`rounded-lg px-3 py-1.5 transition ${filter === "all" ? "bg-white/15 text-white font-semibold" : "text-white/50 hover:bg-white/5"}`}
            >
              All ({factors.items.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter("critical")}
              className={`rounded-lg px-3 py-1.5 transition ${filter === "critical" ? "bg-white/15 text-white font-semibold" : "text-white/50 hover:bg-white/5"}`}
            >
              Critical ({criticalItems.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter("changed")}
              className={`rounded-lg px-3 py-1.5 transition ${filter === "changed" ? "bg-white/15 text-white font-semibold" : "text-white/50 hover:bg-white/5"}`}
            >
              Changed ({factors.summary.changedCount})
            </button>
            <button
              type="button"
              onClick={() => setFilter("added")}
              className={`rounded-lg px-3 py-1.5 transition ${filter === "added" ? "bg-white/15 text-white font-semibold" : "text-white/50 hover:bg-white/5"}`}
            >
              Added ({factors.summary.addedCount})
            </button>
            <button
              type="button"
              onClick={() => setFilter("removed")}
              className={`rounded-lg px-3 py-1.5 transition ${filter === "removed" ? "bg-white/15 text-white font-semibold" : "text-white/50 hover:bg-white/5"}`}
            >
              Removed ({factors.summary.removedCount})
            </button>
            <button
              type="button"
              onClick={() => setFilter("ambiguous")}
              className={`rounded-lg px-3 py-1.5 transition ${filter === "ambiguous" ? "bg-white/15 text-white font-semibold" : "text-white/50 hover:bg-white/5"}`}
            >
              Ambiguous ({factors.summary.ambiguousCount})
            </button>
          </div>
        </div>

        {filteredItems.length === 0 ? (
          <p className="py-8 text-center text-xs text-white/40">No factor records match the selected filter.</p>
        ) : (
          <div className="mt-4 divide-y divide-white/5 font-sans">
            {filteredItems.map((item) => (
              <div key={item.key} className="py-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${getStatusBadgeClass(item.status)}`}>
                      {item.status}
                    </span>
                    {item.critical ? (
                      <span className="rounded-full border border-red-500/20 bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-red-300">
                        Critical
                      </span>
                    ) : null}
                    <span className="font-medium text-white/90">{item.label}</span>
                    <span className="text-[10px] text-white/40 font-mono">({item.category})</span>
                  </div>

                  <div className="font-mono text-[11px] text-white/70">
                    <span className="text-white/40 mr-1">Impact:</span>
                    <span className="font-semibold text-white/90">
                      {formatImpactState(item.impact.state, item.impact.base, item.impact.target, item.impact.delta)}
                    </span>
                  </div>
                </div>

                <div className="mt-1 text-white/60">
                  {item.status === "added" ? (
                    <p className="text-emerald-300/80">Added: {item.targetDetail ?? item.label}</p>
                  ) : item.status === "removed" ? (
                    <p className="text-rose-300/80">Removed: {item.baseDetail ?? item.label}</p>
                  ) : item.status === "ambiguous" ? (
                    <p className="text-purple-300/80">{item.ambiguityReason}</p>
                  ) : item.status === "changed" ? (
                    <div className="flex flex-wrap items-center gap-2 text-white/70">
                      <span className="line-through text-white/40">{item.baseDetail ?? "Base detail"}</span>
                      <span>→</span>
                      <span className="font-medium text-white/90">{item.targetDetail ?? "Target detail"}</span>
                    </div>
                  ) : (
                    <p className="text-white/40">{item.targetDetail ?? item.baseDetail ?? item.label}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
