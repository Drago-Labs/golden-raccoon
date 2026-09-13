"use client";

import { StatusBadge } from "@/components/a11y/StatusBadge";
import type { LiquidityCoverage, VenueAnalysis } from "@/server/research/liquidity-depth/schema";

/**
 * The standing caveats.
 *
 * Assumptions and qualifications are rendered as lists rather than a single
 * sentence, because a reader deciding whether to trust a depth figure needs to
 * see each condition separately.
 */
export function CoverageNotice({ coverage, venue }: { coverage: LiquidityCoverage; venue: VenueAnalysis | null }) {
  return (
    <section aria-labelledby="liquidity-coverage-heading" className="space-y-4">
      <h3 id="liquidity-coverage-heading" className="text-sm font-semibold">
        Coverage and assumptions
      </h3>

      <p className="rounded-xl border border-white/10 px-4 py-3 text-xs text-subtle" data-testid="informational-notice">
        This workbench is informational. It reports what a snapshot shows and never creates an executable quote, selects a
        route, or prepares a transaction.
      </p>

      <div className="rounded-xl border border-white/10 p-4">
        <StatusBadge tone={coverage.state === "complete" ? "success" : coverage.state === "empty" ? "neutral" : "warning"}>
          {coverage.state}
        </StatusBadge>
        <p className="mt-2 text-xs text-subtle">{coverage.note}</p>
        <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
          <div>
            <dt className="text-subtle">Venues</dt>
            <dd className="tabular-nums">
              {coverage.modelledVenueCount} modelled of {coverage.venueCount}
            </dd>
          </div>
          <div>
            <dt className="text-subtle">Stale / truncated / unsupported</dt>
            <dd className="tabular-nums">
              {coverage.staleVenueCount} / {coverage.truncatedVenueCount} / {coverage.unsupportedVenueCount}
            </dd>
          </div>
        </dl>
      </div>

      {venue ? (
        <>
          {venue.qualifications.length > 0 ? (
            <div data-testid="venue-qualifications">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-subtle">
                Why this venue&apos;s figures are qualified
              </h4>
              <ul className="mt-2 space-y-1 text-xs text-[#f2c86d]">
                {venue.qualifications.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {venue.assumptions.length > 0 ? (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-subtle">Assumptions</h4>
              <ul className="mt-2 space-y-1 text-xs text-subtle">
                {venue.assumptions.map((assumption) => (
                  <li key={assumption}>{assumption}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
