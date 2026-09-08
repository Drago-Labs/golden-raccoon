"use client";

import { useState } from "react";
import type { RulePreviewResult } from "@/server/rules/preview";

export type RulePreviewPanelProps = {
  preview: RulePreviewResult | null;
  isLoading?: boolean;
  error?: string | null;
  onRefresh?: () => void;
  className?: string;
};

/**
 * Visual panel displaying simulated signal matches and policy rejection reasons.
 */
export function RulePreviewPanel({
  preview,
  isLoading = false,
  error = null,
  onRefresh,
  className = "",
}: RulePreviewPanelProps) {
  const [showRejected, setShowRejected] = useState(false);

  return (
    <section aria-labelledby="preview-panel-heading" className={`glass-panel rounded-lg p-5 sm:p-6 space-y-4 ${className}`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 id="preview-panel-heading" className="text-xl font-semibold">
            Signal Preview
          </h2>
          <p className="text-sm text-white/64">
            Simulates how candidate rules evaluate against recent recorded market signals without persisting.
          </p>
        </div>

        {onRefresh ? (
          <button
            type="button"
            onClick={onRefresh}
            disabled={isLoading}
            className="self-start rounded-md border border-white/20 px-3 py-1.5 text-xs font-medium text-white/80 hover:border-white/40 hover:text-white disabled:opacity-50"
          >
            {isLoading ? "Simulating..." : "Refresh preview"}
          </button>
        ) : null}
      </div>

      {isLoading ? (
        <div className="rounded-md border border-white/10 bg-black/20 p-4 text-sm text-white/60">
          Evaluating candidate rule against recent market signals...
        </div>
      ) : null}

      {error ? (
        <div role="alert" className="rounded-md border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">
          {error}
        </div>
      ) : null}

      {!isLoading && !error && preview ? (
        <div className="space-y-4">
          {preview.zeroMatches ? (
            <div
              role="alert"
              className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-amber-200 space-y-1"
            >
              <div className="flex items-center gap-2 font-semibold">
                <span aria-hidden>&bull;</span>
                <span>Zero Matching Signals</span>
              </div>
              <p className="text-xs text-amber-300/80">
                This rule matches 0 of {preview.totalEvaluated} recorded signals. No observations meet all policy criteria.
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-200">
              <span className="text-sm font-semibold">
                {preview.matchedCount} of {preview.totalEvaluated} signals matched
              </span>
              <p className="mt-1 text-xs text-emerald-300/80">
                Observations meeting all chain, risk, liquidity, and category policy limits.
              </p>
            </div>
          )}

          {preview.matched.length > 0 ? (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-white/70 mb-2">Matched Signals</h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {preview.matched.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-md border border-white/10 bg-black/20 p-3 text-xs flex flex-col justify-between"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-white/90">{item.symbol ?? item.canonicalKey}</span>
                      <span className="rounded bg-white/10 px-1.5 py-0.5 text-white/60">{item.chainId}</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-white/50">
                      <span>Risk: {item.riskScore ?? "N/A"}</span>
                      <span>
                        Liquidity: {item.liquidityUsd !== undefined ? `$${item.liquidityUsd.toLocaleString()}` : "N/A"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {preview.rejected.length > 0 ? (
            <div>
              <button
                type="button"
                onClick={() => setShowRejected(!showRejected)}
                className="text-xs font-semibold uppercase tracking-wider text-white/60 hover:text-white flex items-center gap-1"
              >
                <span>{showRejected ? "Hide" : "Show"} Blocked Signals ({preview.rejected.length})</span>
                <span aria-hidden>{showRejected ? "&uarr;" : "&darr;"}</span>
              </button>

              {showRejected ? (
                <div className="mt-2 space-y-2">
                  {preview.rejected.map((item) => (
                    <div key={item.id} className="rounded-md border border-white/5 bg-black/30 p-2.5 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-white/70">{item.symbol ?? item.canonicalKey}</span>
                        <span className="text-white/40">{item.chainId}</span>
                      </div>
                      <ul className="mt-1 list-disc list-inside text-rose-300/80 space-y-0.5">
                        {item.reasons.map((reason, idx) => (
                          <li key={idx}>{reason}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
