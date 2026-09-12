import React from "react";
import { type ObservationCoverage as CoverageType } from "@/server/research/peg-observations";

interface ObservationCoverageProps {
  coverage: CoverageType;
  className?: string;
}

const STATUS_CONFIG: Record<
  string,
  { label: string; badgeClass: string; description: string }
> = {
  complete: {
    label: "Continuous Coverage",
    badgeClass: "bg-emerald-950/60 text-emerald-300 border-emerald-700",
    description: "Observations are continuous within sampling tolerances with complete currency conversions.",
  },
  partial: {
    label: "Partial Coverage",
    badgeClass: "bg-amber-950/60 text-amber-300 border-amber-700",
    description: "Sampling contains non-critical intervals or isolated missing conversion rates.",
  },
  sparse: {
    label: "Sparse Observations",
    badgeClass: "bg-yellow-950/60 text-yellow-300 border-yellow-700",
    description: "Significant unobserved time intervals detected across window. Unobserved intervals are not interpolated.",
  },
  gap_interrupted: {
    label: "Gap Interrupted",
    badgeClass: "bg-orange-950/60 text-orange-300 border-orange-700",
    description: "Active peg deviation interrupted by an unobserved sampling gap without verified recovery.",
  },
  missing_reference_rates: {
    label: "Missing Reference Rates",
    badgeClass: "bg-red-950/60 text-red-300 border-red-700",
    description: "Observation currency cannot be converted to target peg currency without synthetic rates.",
  },
  empty: {
    label: "Empty Observation Window",
    badgeClass: "bg-zinc-900/60 text-zinc-300 border-zinc-700",
    description: "Zero valid price observations recorded in the selected window.",
  },
  unavailable: {
    label: "Unsupported / Unavailable",
    badgeClass: "bg-rose-950/60 text-rose-300 border-rose-700",
    description: "Asset identity not registered and missing explicit peg declaration.",
  },
};

/**
 * Renders observation coverage metrics, data gap notices, and historical sourcing limits.
 */
export function ObservationCoverage({ coverage, className = "" }: ObservationCoverageProps) {
  const config = STATUS_CONFIG[coverage.status] || STATUS_CONFIG.partial;

  return (
    <div className={`rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 backdrop-blur-sm ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/80 pb-4">
        <div>
          <h3 className="text-sm font-semibold tracking-wide text-zinc-200 uppercase">
            Observation Coverage and Continuity
          </h3>
          <p className="mt-1 text-xs text-zinc-400">{config.description}</p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${config.badgeClass}`}
            role="status"
          >
            {config.label}
          </span>
          <span className="inline-flex items-center rounded-full border border-zinc-700 bg-zinc-800/80 px-2.5 py-1 text-xs font-mono font-medium text-zinc-300">
            {coverage.coveragePercentage}% Window Span
          </span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        <div className="rounded-lg border border-zinc-800/70 bg-zinc-950/40 p-3">
          <div className="text-xs text-zinc-400">Total Observations</div>
          <div className="mt-1 font-mono text-lg font-bold text-zinc-100">
            {coverage.totalObservations}
          </div>
        </div>

        <div className="rounded-lg border border-zinc-800/70 bg-zinc-950/40 p-3">
          <div className="text-xs text-zinc-400">Valid Window Points</div>
          <div className="mt-1 font-mono text-lg font-bold text-zinc-100">
            {coverage.validObservations}
          </div>
        </div>

        <div className="rounded-lg border border-zinc-800/70 bg-zinc-950/40 p-3">
          <div className="text-xs text-zinc-400">Deduped Points</div>
          <div className="mt-1 font-mono text-lg font-bold text-zinc-100">
            {coverage.duplicateTimestampsResolved}
          </div>
        </div>

        <div className="rounded-lg border border-zinc-800/70 bg-zinc-950/40 p-3">
          <div className="text-xs text-zinc-400">Chronology Reordered</div>
          <div className="mt-1 font-mono text-lg font-bold text-zinc-100">
            {coverage.outOfOrderObservationsSorted}
          </div>
        </div>

        <div className="rounded-lg border border-zinc-800/70 bg-zinc-950/40 p-3">
          <div className="text-xs text-zinc-400">Gaps Exceeding Limit</div>
          <div className="mt-1 font-mono text-lg font-bold text-amber-300">
            {coverage.gapsDetected.length}
          </div>
        </div>

        <div className="rounded-lg border border-zinc-800/70 bg-zinc-950/40 p-3">
          <div className="text-xs text-zinc-400">Missing FX Rates</div>
          <div className="mt-1 font-mono text-lg font-bold text-rose-300">
            {coverage.missingRateTimestamps.length}
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-950/70 p-3 text-xs text-zinc-400">
        <span className="font-semibold text-zinc-300">Historical Sourcing Limits: </span>
        <span>{coverage.sourcingLimits}</span>
      </div>
    </div>
  );
}
