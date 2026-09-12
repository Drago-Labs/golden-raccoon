"use client";

import { useState, useEffect, useCallback, useId } from "react";
import { AlertCircle, CheckCircle2, GitCompare, Info, RefreshCw, ShieldAlert } from "lucide-react";
import type { ReportComparisonDocument } from "@/server/research/report-comparison/schema";
import { ScoreDeltaTable } from "./ScoreDeltaTable";
import { FactorChanges } from "./FactorChanges";
import { SourceChanges } from "./SourceChanges";
import { SnapshotSelector } from "./SnapshotSelector";

type Props = {
  initialBaseId?: string;
  initialTargetId?: string;
  initialData?: ReportComparisonDocument;
};

type ActiveTab = "scores" | "factors" | "sources";

/**
 * Workbench view that renders semantic snapshot comparison details,
 * score deltas, order-independent factor transitions, and telemetry freshness.
 */
export function ReportComparison({ initialBaseId, initialTargetId, initialData }: Props) {
  const [data, setData] = useState<ReportComparisonDocument | undefined>(initialData);
  const [loading, setLoading] = useState(!initialData && Boolean(initialBaseId && initialTargetId));
  const [error, setError] = useState<string>();
  const [activeTab, setActiveTab] = useState<ActiveTab>("scores");
  const tablistLabelId = useId();

  const handleCompare = useCallback(async (baseId: string, targetId: string) => {
    setLoading(true);
    setError(undefined);
    try {
      const response = await fetch("/api/insights/report-comparison", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseId, targetId }),
      });

      const body = (await response.json()) as ReportComparisonDocument & { error?: string; code?: string };
      if (!response.ok) {
        throw new Error(body.error ?? "Failed to reconcile snapshots.");
      }

      setData(body);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "An unexpected comparison error occurred.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    if (!initialData && initialBaseId && initialTargetId) {
      fetch("/api/insights/report-comparison", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseId: initialBaseId, targetId: initialTargetId }),
      })
        .then(async (response) => {
          const body = (await response.json()) as ReportComparisonDocument & { error?: string };
          if (!response.ok) {
            throw new Error(body.error ?? "Failed to reconcile snapshots.");
          }
          if (!ignore) {
            setData(body);
            setLoading(false);
          }
        })
        .catch((cause) => {
          if (!ignore) {
            setError(cause instanceof Error ? cause.message : "An unexpected comparison error occurred.");
            setLoading(false);
          }
        });
    }
    return () => {
      ignore = true;
    };
  }, [initialData, initialBaseId, initialTargetId]);

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-8">
      <div>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#d9a441]/30 bg-[#d9a441]/10 text-[#f2c86d]">
            <GitCompare className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Snapshot Comparison Workbench</h1>
            <p className="text-xs text-white/50">
              Deterministic, order-independent semantic reconciliation of immutable risk snapshot observations.
            </p>
          </div>
        </div>
      </div>

      <SnapshotSelector
        initialBaseId={initialBaseId}
        initialTargetId={initialTargetId}
        isLoading={loading}
        onCompare={(bId, tId) => void handleCompare(bId, tId)}
      />

      {error ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-950/20 p-6 text-red-200">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-red-400" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-red-300">Comparison Failed</h2>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-red-200/90">{error}</p>
        </div>
      ) : null}

      {loading ? (
        <div className="flex min-h-[300px] flex-col items-center justify-center gap-3 rounded-2xl border border-white/10 bg-[#0d131f]/40 p-12 text-white/60">
          <RefreshCw className="h-6 w-6 animate-spin text-[#d9a441]" />
          <p className="text-xs font-mono">Reconciling snapshot telemetry, scores, and semantic factor keys...</p>
        </div>
      ) : null}

      {!loading && data ? (
        <div className="space-y-6">
          <div className="rounded-2xl border border-white/10 bg-[#0d131f]/90 p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-[#d9a441]">Reconciled Target</span>
                <h2 className="text-xl font-bold text-white">
                  {data.subject.symbol}{" "}
                  <span className="text-xs font-normal text-white/40">({data.subject.network})</span>
                </h2>
                <p className="mt-1 font-mono text-[11px] text-white/40 break-all">
                  Canonical Identity: {data.subject.canonicalIdentity}
                </p>
              </div>

              <div className="text-right">
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold uppercase ${data.comparability.mode === "complete" ? "border-emerald-500/20 bg-emerald-400/10 text-emerald-400" : "border-amber-500/20 bg-amber-400/10 text-amber-300"}`}>
                  {data.comparability.mode === "complete" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
                  {data.comparability.mode} comparison
                </span>
                <p className="mt-1 text-xs text-white/50">
                  {data.factors.summary.hasMaterialDelta ? "Material delta observed" : "No material delta"}
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-white/5 bg-white/[0.02] p-4 text-xs text-white/80 leading-relaxed">
              <span className="font-semibold text-white/90">Summary: </span>
              {data.summary}
            </div>

            {data.comparability.reasons.length > 0 ? (
              <div className="mt-3 space-y-1 text-xs text-amber-300/80">
                {data.comparability.reasons.map((reason) => (
                  <div key={reason} className="flex items-center gap-1.5">
                    <Info className="h-3 w-3" />
                    <span>{reason}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="flex border-b border-white/10" role="tablist" aria-labelledby={tablistLabelId}>
            <span id={tablistLabelId} className="sr-only">Comparison Sections</span>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "scores"}
              onClick={() => setActiveTab("scores")}
              className={`flex items-center gap-2 border-b-2 px-6 py-3 text-xs font-semibold uppercase tracking-wider transition ${activeTab === "scores" ? "border-[#d9a441] text-[#f2c86d]" : "border-transparent text-white/50 hover:text-white/80"}`}
            >
              Metrics & Verdict
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "factors"}
              onClick={() => setActiveTab("factors")}
              className={`flex items-center gap-2 border-b-2 px-6 py-3 text-xs font-semibold uppercase tracking-wider transition ${activeTab === "factors" ? "border-[#d9a441] text-[#f2c86d]" : "border-transparent text-white/50 hover:text-white/80"}`}
            >
              Factor Changes
              {data.factors.summary.changedCount > 0 || data.factors.summary.addedCount > 0 ? (
                <span className="rounded-full bg-[#d9a441]/20 px-2 py-0.2 text-[10px] text-[#f2c86d]">
                  {data.factors.summary.changedCount + data.factors.summary.addedCount}
                </span>
              ) : null}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "sources"}
              onClick={() => setActiveTab("sources")}
              className={`flex items-center gap-2 border-b-2 px-6 py-3 text-xs font-semibold uppercase tracking-wider transition ${activeTab === "sources" ? "border-[#d9a441] text-[#f2c86d]" : "border-transparent text-white/50 hover:text-white/80"}`}
            >
              Telemetry Sources
              {data.sources.summary.disappearedCount > 0 ? (
                <span className="rounded-full bg-red-500/20 px-2 py-0.2 text-[10px] text-red-300 font-bold animate-pulse">
                  {data.sources.summary.disappearedCount}
                </span>
              ) : null}
            </button>
          </div>

          <div>
            {activeTab === "scores" ? (
              <ScoreDeltaTable scoreDelta={data.scoreDelta} subject={data.subject} />
            ) : null}

            {activeTab === "factors" ? (
              <FactorChanges factors={data.factors} />
            ) : null}

            {activeTab === "sources" ? (
              <SourceChanges sources={data.sources} />
            ) : null}
          </div>

          <div className="rounded-2xl border border-white/5 bg-black/20 p-4 text-[11px] leading-relaxed text-white/40">
            <p>
              Report comparisons evaluate snapshot observations as captured at distinct observation intervals. Comparisons are provided strictly for informational purposes. Disappearing telemetry sources indicate unobserved signals, not resolved risk items.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
