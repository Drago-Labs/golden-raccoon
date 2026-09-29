"use client";

import { StatusBadge } from "@/components/a11y/StatusBadge";
import { fromMicroUsd, type ExposureCoverage, type UnresolvedHolding } from "@/server/research/exposure-map/schema";

const reasonLabel: Record<UnresolvedHolding["reason"], string> = {
  no_declared_relationship: "No declared relationship",
  unpriced: "No usable price",
  both: "Unpriced and unmapped",
};

function usd(microUsd: number | null): string {
  return microUsd === null ? "Not priced" : `$${fromMicroUsd(microUsd).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

/**
 * What the map could not account for.
 *
 * This panel exists so an incomplete total is never read as a complete one:
 * unpriced holdings, unmapped holdings and dropped edges are each counted and
 * named.
 */
export function CoveragePanel({
  coverage,
  unresolved,
  unmatchedDeclarations,
}: {
  coverage: ExposureCoverage;
  unresolved: UnresolvedHolding[];
  unmatchedDeclarations: Array<{ fromAssetKey: string; reason: string }>;
}) {
  return (
    <section aria-labelledby="exposure-coverage-heading" className="space-y-4">
      <h3 id="exposure-coverage-heading" className="text-sm font-semibold">
        Coverage
      </h3>

      <div className="rounded-xl border border-white/10 p-4">
        <StatusBadge tone={coverage.state === "complete" ? "success" : coverage.state === "empty" ? "neutral" : "warning"}>
          {coverage.state}
        </StatusBadge>
        <p className="mt-2 text-xs text-subtle">{coverage.note}</p>
        <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
          <div>
            <dt className="text-subtle">Known value base</dt>
            <dd className="tabular-nums">{usd(coverage.knownValueMicroUsd)}</dd>
          </div>
          <div>
            <dt className="text-subtle">Holdings</dt>
            <dd className="tabular-nums">
              {coverage.pricedHoldingCount} priced · {coverage.unpricedHoldingCount} unpriced
            </dd>
          </div>
          <div>
            <dt className="text-subtle">Unmapped value</dt>
            <dd className="tabular-nums">
              {usd(coverage.unmappedValueMicroUsd)} across {coverage.unmappedHoldingCount} holding
              {coverage.unmappedHoldingCount === 1 ? "" : "s"}
            </dd>
          </div>
          <div>
            <dt className="text-subtle">Edges excluded</dt>
            <dd className="tabular-nums">
              {coverage.droppedEdgeCount} ({coverage.cycleCount} from cycles)
            </dd>
          </div>
          <div>
            <dt className="text-subtle">Overlapping groups</dt>
            <dd className="tabular-nums">{coverage.overlappingGroupCount}</dd>
          </div>
        </dl>
      </div>

      {unresolved.length > 0 ? (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-subtle">
            Unresolved holdings ({unresolved.length})
          </h4>
          <ul className="mt-2 space-y-2" data-testid="unresolved-holdings">
            {unresolved.map((entry) => (
              <li key={entry.holdingId} className="rounded-lg border border-white/10 px-3 py-2 text-xs">
                <span className="flex flex-wrap items-center gap-2">
                  <StatusBadge tone="warning">{reasonLabel[entry.reason]}</StatusBadge>
                  <span className="font-medium">{entry.symbol}</span>
                  <span className="tabular-nums text-subtle">{usd(entry.valueMicroUsd)}</span>
                </span>
                <span className="mt-1 block text-subtle">{entry.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {unmatchedDeclarations.length > 0 ? (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-subtle">
            Declarations that were not applied ({unmatchedDeclarations.length})
          </h4>
          <ul className="mt-2 space-y-2" data-testid="unmatched-declarations">
            {unmatchedDeclarations.map((entry, index) => (
              <li key={`${entry.fromAssetKey}-${index}`} className="rounded-lg border border-white/10 px-3 py-2 text-xs">
                <span className="font-mono">{entry.fromAssetKey}</span>
                <span className="mt-1 block text-subtle">{entry.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
