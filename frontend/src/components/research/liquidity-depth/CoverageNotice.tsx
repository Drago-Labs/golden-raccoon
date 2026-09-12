import React from "react";
import { AlertTriangle, CheckCircle2, Clock, Info, ShieldAlert } from "lucide-react";
import { type CoverageReport, type VenueModelType } from "@/server/research/liquidity-depth/schema";

export type CoverageNoticeProps = {
  coverage: CoverageReport;
  modelType: VenueModelType;
  venueName: string;
};

export function CoverageNotice({ coverage, modelType, venueName }: CoverageNoticeProps) {
  const getBadgeStyle = (status: string) => {
    switch (status) {
      case "complete":
        return "border-emerald-500/20 bg-emerald-500/10 text-emerald-400";
      case "partial":
        return "border-amber-500/20 bg-amber-500/10 text-amber-400";
      case "stale":
        return "border-rose-500/20 bg-rose-500/10 text-rose-400";
      case "truncated":
        return "border-purple-500/20 bg-purple-500/10 text-purple-400";
      case "unsupported":
        return "border-orange-500/20 bg-orange-500/10 text-orange-400";
      default:
        return "border-zinc-500/20 bg-zinc-500/10 text-zinc-400";
    }
  };

  const isWarning = coverage.status !== "complete";

  return (
    <div
      className={`rounded-lg border p-4 transition-colors ${
        isWarning ? "border-amber-500/30 bg-amber-500/5" : "border-white/10 bg-white/5"
      }`}
      role="region"
      aria-label="Coverage and Data Provenance"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
        <div className="flex items-center gap-2">
          {isWarning ? (
            <AlertTriangle className="h-5 w-5 text-amber-400" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="h-5 w-5 text-emerald-400" aria-hidden="true" />
          )}
          <span className="font-medium text-white">Provenance & Coverage Status</span>
          <span
            className={`rounded px-2 py-0.5 text-xs font-semibold uppercase ${getBadgeStyle(
              coverage.status,
            )}`}
          >
            {coverage.status}
          </span>
        </div>

        <div className="flex items-center gap-4 text-xs text-white/60">
          <span className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            Observed: {new Date(coverage.lastObservedAt).toLocaleTimeString()}
          </span>
          {coverage.ledgerOrBlock > 0 && (
            <span>Block/Ledger: #{coverage.ledgerOrBlock.toLocaleString()}</span>
          )}
        </div>
      </div>

      {coverage.reasons.length > 0 && (
        <div className="mt-3 space-y-1 text-sm text-amber-200/90">
          {coverage.reasons.map((reason, idx) => (
            <div key={idx} className="flex items-start gap-1.5">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" aria-hidden="true" />
              <span>{reason}</span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 text-xs text-white/50">
        <div className="flex items-center gap-1 font-medium text-white/70">
          <Info className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Model Assumptions ({venueName} - {modelType}):</span>
        </div>
        <ul className="mt-1 list-disc space-y-0.5 pl-5">
          {coverage.modelAssumptions.map((assumption, idx) => (
            <li key={idx}>{assumption}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
