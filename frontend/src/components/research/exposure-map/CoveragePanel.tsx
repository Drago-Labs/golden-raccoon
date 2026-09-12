"use client";

import { useState } from "react";
import type { CoverageGaps } from "@/server/research/exposure-map/schema";
import { CheckCircle2, AlertCircle, HelpCircle, ChevronDown, ChevronUp, Layers } from "lucide-react";

type Props = {
  coverage: CoverageGaps;
};

function getStatusBadge(status: CoverageGaps["coverageStatus"]) {
  switch (status) {
    case "complete":
      return {
        label: "Complete Coverage",
        icon: CheckCircle2,
        className: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
      };
    case "partial":
      return {
        label: "Partial Coverage",
        icon: AlertCircle,
        className: "bg-amber-500/10 text-amber-400 border-amber-500/20",
      };
    case "unavailable":
      return {
        label: "Coverage Unavailable",
        icon: HelpCircle,
        className: "bg-rose-500/10 text-rose-400 border-rose-500/20",
      };
  }
}

/**
 * Displays known-value coverage, unresolved assets, unpriced holdings, and observation timestamps.
 */
export function CoveragePanel({ coverage }: Props) {
  const [showUnresolved, setShowUnresolved] = useState(false);
  const [showUnpriced, setShowUnpriced] = useState(false);

  const statusBadge = getStatusBadge(coverage.coverageStatus);
  const StatusIcon = statusBadge.icon;
  const coveragePercent = (coverage.knownValueCoverageRatio * 100).toFixed(1);

  return (
    <div
      className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-6 shadow-xl backdrop-blur-md"
      data-testid="coverage-panel"
    >
      <div className="flex items-center justify-between border-b border-zinc-800/80 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <Layers className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-zinc-100">Coverage &amp; Integrity</h3>
            <p className="text-xs text-zinc-400">Pricing and Relationship Resolution Status</p>
          </div>
        </div>

        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${statusBadge.className}`}
          role="status"
          data-testid="coverage-status-badge"
        >
          <StatusIcon className="h-3.5 w-3.5" />
          {statusBadge.label}
        </span>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-3.5 text-center">
          <div className="text-xs font-medium text-zinc-400">Known-Value Ratio</div>
          <div className="mt-1 text-xl font-bold tracking-tight text-zinc-100" data-testid="coverage-ratio">
            {coveragePercent}%
          </div>
          <div className="mt-0.5 text-[10px] text-zinc-500">Portfolio resolved</div>
        </div>

        <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-3.5 text-center">
          <div className="text-xs font-medium text-zinc-400">Priced Holdings</div>
          <div className="mt-1 text-xl font-bold tracking-tight text-zinc-100">
            {coverage.pricedHoldingsCount} / {coverage.totalHoldingsCount}
          </div>
          <div className="mt-0.5 text-[10px] text-zinc-500">
            {coverage.unpricedHoldingsCount} unpriced
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-3.5 text-center">
          <div className="text-xs font-medium text-zinc-400">Resolved Relations</div>
          <div className="mt-1 text-xl font-bold tracking-tight text-zinc-100">
            {coverage.resolvedHoldingsCount} / {coverage.totalHoldingsCount}
          </div>
          <div className="mt-0.5 text-[10px] text-zinc-500">
            {coverage.unresolvedHoldingsCount} unmapped
          </div>
        </div>
      </div>

      <div className="mt-4 text-[11px] text-zinc-500 text-right">
        Observation timestamp: {new Date(coverage.observationTimestamp).toLocaleString()}
      </div>

      {coverage.overlappingCategories.length > 0 && (
        <div className="mt-4 rounded-xl border border-blue-500/20 bg-blue-500/5 p-3.5">
          <div className="text-xs font-semibold text-blue-300">
            Overlapping Category Roles ({coverage.overlappingCategories.length})
          </div>
          <div className="mt-1.5 space-y-1">
            {coverage.overlappingCategories.map((cat) => (
              <div key={cat.entityId} className="text-xs text-zinc-300 flex items-center justify-between">
                <span>{cat.name}</span>
                <span className="text-[10px] text-zinc-400">{cat.roles.join(" • ")}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {coverage.unresolvedHoldings.length > 0 && (
        <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
          <button
            type="button"
            onClick={() => setShowUnresolved(!showUnresolved)}
            className="flex w-full items-center justify-between text-xs font-medium text-amber-300 transition hover:text-amber-200"
            aria-expanded={showUnresolved}
          >
            <span>Unresolved Holdings ({coverage.unresolvedHoldings.length})</span>
            {showUnresolved ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {showUnresolved && (
            <div className="mt-3 space-y-2 border-t border-zinc-800 pt-2 text-xs">
              {coverage.unresolvedHoldings.map((h) => (
                <div
                  key={h.assetKey}
                  className="flex items-center justify-between text-zinc-300"
                  data-testid="unresolved-holding-item"
                >
                  <div>
                    <span className="font-semibold text-zinc-100">{h.symbol}</span>
                    <span className="ml-2 text-[10px] text-zinc-400">{h.network}</span>
                  </div>
                  <span className="font-medium text-zinc-300">
                    ${h.valueUsd.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {coverage.unpricedHoldings.length > 0 && (
        <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
          <button
            type="button"
            onClick={() => setShowUnpriced(!showUnpriced)}
            className="flex w-full items-center justify-between text-xs font-medium text-rose-300 transition hover:text-rose-200"
            aria-expanded={showUnpriced}
          >
            <span>Unpriced Assets ({coverage.unpricedHoldings.length})</span>
            {showUnpriced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {showUnpriced && (
            <div className="mt-3 space-y-2 border-t border-zinc-800 pt-2 text-xs">
              {coverage.unpricedHoldings.map((h) => (
                <div
                  key={h.assetKey}
                  className="flex items-center justify-between text-zinc-300"
                  data-testid="unpriced-holding-item"
                >
                  <div>
                    <span className="font-semibold text-zinc-100">{h.symbol}</span>
                    <span className="ml-2 text-[10px] text-zinc-400">{h.network}</span>
                  </div>
                  <span className="text-zinc-400">Balance: {h.balance.toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
