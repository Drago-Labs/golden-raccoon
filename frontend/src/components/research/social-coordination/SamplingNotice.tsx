"use client";

import { StatusBadge } from "@/components/a11y/StatusBadge";
import type { CoordinationCoverage, SamplingNotice as Notice } from "@/server/research/social-coordination/schema";

const stateTone = { complete: "success", partial: "warning", insufficient: "warning", empty: "neutral" } as const;

/**
 * Sampling limits.
 *
 * Rendered above the findings rather than below them, because how much of the
 * conversation was seen decides how much any measurement below is worth.
 */
export function SamplingNotice({ sampling, coverage }: { sampling: Notice; coverage: CoordinationCoverage }) {
  return (
    <section aria-labelledby="coordination-sampling-heading" className="rounded-xl border border-white/10 p-4">
      <h2 id="coordination-sampling-heading" className="text-sm font-semibold">
        Sampling limits
      </h2>

      <p className="mt-2">
        <StatusBadge tone={stateTone[coverage.state]}>{coverage.state}</StatusBadge>
      </p>
      <p className="mt-2 text-xs text-subtle">{coverage.note}</p>

      <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
        <div>
          <dt className="text-subtle">Observations analysed</dt>
          <dd className="tabular-nums">
            {sampling.analysedCount} of {sampling.observationCount}
            {sampling.observationCount > 0 ? ` (${Math.round(sampling.analysedFraction * 100)}%)` : ""}
          </dd>
        </div>
        <div>
          <dt className="text-subtle">Distinct author accounts</dt>
          <dd className="tabular-nums">{sampling.distinctAuthorCount}</dd>
        </div>
        <div>
          <dt className="text-subtle">Excluded / undated</dt>
          <dd className="tabular-nums">
            {sampling.excludedCount} / {sampling.missingTimestampCount}
          </dd>
        </div>
        <div>
          <dt className="text-subtle">Sample declared exhaustive</dt>
          <dd>{sampling.callerDeclaredPartial ? "No" : "Yes"}</dd>
        </div>
      </dl>

      {sampling.notes.length > 0 ? (
        <ul className="mt-3 space-y-1 text-xs text-subtle" data-testid="sampling-notes">
          {sampling.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
