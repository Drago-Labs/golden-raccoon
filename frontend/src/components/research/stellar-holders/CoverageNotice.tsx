"use client";

import { StatusBadge } from "@/components/a11y/StatusBadge";
import type { CoverageReport } from "@/server/research/stellar-holders/schema";

const TONES = {
  complete: "success",
  partial: "warning",
  empty: "neutral",
  unavailable: "danger",
} as const;

/** States whether the read covered issued supply, and the exact fraction when it did not. */
export function CoverageNotice({ coverage, ledger }: { coverage: CoverageReport; ledger: number | null }) {
  const fraction = coverage.fraction.denominator === "0"
    ? "n/a"
    : `${coverage.fraction.numerator}/${coverage.fraction.denominator}`;

  return (
    <section aria-labelledby="holder-coverage-heading" data-testid="coverage-notice" className="space-y-3 rounded-2xl border border-white/10 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 id="holder-coverage-heading" className="text-sm font-semibold">
          Coverage
        </h2>
        <StatusBadge tone={TONES[coverage.state]}>{coverage.state}</StatusBadge>
      </div>
      <p className="text-sm text-white/80">{coverage.note}</p>
      <dl className="grid gap-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs text-white/50">Fraction of supply covered</dt>
          <dd data-testid="coverage-fraction" className="tabular-nums">{fraction}</dd>
        </div>
        <div>
          <dt className="text-xs text-white/50">Covered / issued</dt>
          <dd className="tabular-nums">{coverage.covered} / {coverage.issued}</dd>
        </div>
        <div>
          <dt className="text-xs text-white/50">Ledger</dt>
          <dd className="tabular-nums">{ledger ?? "Unavailable"}</dd>
        </div>
      </dl>
    </section>
  );
}
