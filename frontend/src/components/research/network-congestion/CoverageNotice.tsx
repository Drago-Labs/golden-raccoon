import { StatusBadge } from "@/components/a11y/StatusBadge";
import type { CongestionCoverage, CongestionLookup } from "@/server/research/network-congestion/schema";

const TONES = {
  complete: "success",
  partial: "warning",
  empty: "neutral",
  unavailable: "danger",
} as const;

/**
 * Says what was left out of the statistics, including a provider that could not be read.
 */
export function CoverageNotice({
  coverage,
  lookup,
  error,
}: {
  coverage: CongestionCoverage | null;
  lookup: CongestionLookup | null;
  error: { code: string; message: string } | null;
}) {
  if (error) {
    return (
      <section data-testid="coverage-notice" aria-labelledby="coverage-heading" className="glass-panel rounded-[28px] p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="coverage-heading" className="text-lg font-semibold">
            Coverage
          </h2>
          <StatusBadge tone={TONES.unavailable}>unavailable</StatusBadge>
        </div>
        <p role="alert" className="mt-3 text-sm leading-6 text-white/70">
          {error.message} No capacity figure, surge period, or fee percentile was invented for this window.
        </p>
        <p className="mt-2 text-xs text-white/42">Error code: {error.code}</p>
      </section>
    );
  }

  if (!coverage) return null;

  return (
    <section data-testid="coverage-notice" aria-labelledby="coverage-heading" className="glass-panel rounded-[28px] p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="coverage-heading" className="text-lg font-semibold">
          Coverage
        </h2>
        <StatusBadge tone={TONES[coverage.state]}>{coverage.state}</StatusBadge>
      </div>
      <p className="mt-3 text-sm leading-6 text-white/70">{coverage.note}</p>
      <p className="mt-2 text-sm leading-6 text-white/70">
        Classic inclusion fees and Soroban resource fees are shown as separate figures and are never added together.
      </p>
      {lookup ? <p className="mt-2 text-sm text-white/70">{lookup.note}</p> : null}
      <p className="mt-2 text-xs text-white/42">
        {coverage.presentLedgerCount} present · {coverage.missingLedgerCount} missing · {coverage.gapCount} gap
        {coverage.gapCount === 1 ? "" : "s"}
        {coverage.truncated ? " · truncated" : ""}
      </p>
    </section>
  );
}
