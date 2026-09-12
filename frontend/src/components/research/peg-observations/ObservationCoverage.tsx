"use client";

import { StatusBadge } from "@/components/a11y/StatusBadge";
import type { AssetCoverage, ObservationGap } from "@/server/research/peg-observations/schema";

/**
 * Coverage bands for a series.
 *
 * The gap list is the important part: it names the intervals the data says
 * nothing about, so a reader cannot mistake a flat line between two points for
 * evidence that the peg held.
 */
export function ObservationCoverage({
  coverage,
  gaps,
  undefinedAssets,
}: {
  coverage: AssetCoverage;
  gaps: ObservationGap[];
  undefinedAssets: Array<{ identityKey: string; symbol: string; reason: string }>;
}) {
  return (
    <section aria-labelledby="peg-coverage-heading" className="space-y-4">
      <h3 id="peg-coverage-heading" className="text-sm font-semibold">
        Observation coverage
      </h3>

      <div className="rounded-xl border border-white/10 p-4">
        <StatusBadge tone={coverage.state === "complete" ? "success" : coverage.state === "partial" ? "warning" : "danger"}>
          {coverage.state}
        </StatusBadge>
        <p className="mt-2 text-xs text-subtle">{coverage.note}</p>
        <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
          <div>
            <dt className="text-subtle">Observations</dt>
            <dd className="tabular-nums">
              {coverage.convertedCount} converted of {coverage.observationCount}
            </dd>
          </div>
          <div>
            <dt className="text-subtle">Stale / duplicate timestamps</dt>
            <dd className="tabular-nums">
              {coverage.staleCount} / {coverage.duplicateTimestampCount}
            </dd>
          </div>
          <div>
            <dt className="text-subtle">Gaps</dt>
            <dd className="tabular-nums">
              {coverage.gapCount}
              {coverage.longestGapSeconds > 0 ? ` · longest ${coverage.longestGapSeconds}s` : ""}
            </dd>
          </div>
          <div>
            <dt className="text-subtle">Window observed</dt>
            <dd className="tabular-nums">
              {coverage.observedWindowFraction === null
                ? "Not derivable"
                : `${(coverage.observedWindowFraction * 100).toFixed(1)}%`}
            </dd>
          </div>
        </dl>
      </div>

      {gaps.length > 0 ? (
        <div data-testid="observation-gaps">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-subtle">Unobserved intervals ({gaps.length})</h4>
          <ul className="mt-2 space-y-2">
            {gaps.map((gap) => (
              <li key={`${gap.afterObservedAt}-${gap.beforeObservedAt}`} className="rounded-lg border border-white/10 px-3 py-2 text-xs">
                <span className="font-mono">
                  {gap.afterObservedAt} → {gap.beforeObservedAt}
                </span>
                <span className="mt-1 block text-subtle">{gap.note}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {undefinedAssets.length > 0 ? (
        <div data-testid="undefined-assets">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-subtle">
            Assets with no declared peg ({undefinedAssets.length})
          </h4>
          <ul className="mt-2 space-y-2">
            {undefinedAssets.map((asset) => (
              <li key={asset.identityKey} className="rounded-lg border border-white/10 px-3 py-2 text-xs">
                <span className="font-medium">{asset.symbol}</span>
                <span className="ml-2 break-all font-mono text-[11px] text-subtle">{asset.identityKey}</span>
                <span className="mt-1 block text-subtle">{asset.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
