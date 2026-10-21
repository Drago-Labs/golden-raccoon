import { StatusBadge } from "@/components/a11y/StatusBadge";
import type { CoverageNotice as CoverageNoticeModel } from "@/server/research/rpc-consistency/schema";

const TONES = {
  complete: "success",
  partial: "warning",
  single_source: "neutral",
  unavailable: "danger",
} as const;

const LABELS = {
  complete: "Complete",
  partial: "Partial",
  single_source: "Single source",
  unavailable: "Unavailable",
} as const;

/** What the comparison was able to see, including a single-source result when one provider is down. */
export function CoverageNotice({ coverage }: { coverage: CoverageNoticeModel }) {
  return (
    <section aria-labelledby="coverage-notice-heading" data-testid="coverage-notice" className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="coverage-notice-heading" className="text-lg font-semibold">
          Coverage
        </h2>
        <StatusBadge tone={TONES[coverage.state]}>{LABELS[coverage.state]}</StatusBadge>
      </div>
      <p className="mt-3 text-sm leading-6 text-white/70">{coverage.note}</p>
      <p className="mt-2 text-xs text-white/45">
        {coverage.fieldCount} field(s) · {coverage.matchedCount} matched · {coverage.laggingCount} lagging ·{" "}
        {coverage.conflictingCount} conflicting · {coverage.singleSourceCount} single-source
      </p>
    </section>
  );
}
