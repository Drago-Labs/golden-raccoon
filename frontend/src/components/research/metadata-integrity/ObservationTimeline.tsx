"use client";

import type { MetadataObservation } from "@/server/research/metadata-integrity/schema";

export function ObservationTimeline(props: { timeline: MetadataObservation[] }) {
  if (props.timeline.length === 0) {
    return (
      <section aria-labelledby="timeline-heading" data-testid="observation-timeline">
        <h2 id="timeline-heading" className="text-lg font-semibold">
          Observation timeline
        </h2>
        <p className="mt-2 text-sm text-muted">No observations yet.</p>
      </section>
    );
  }

  return (
    <section aria-labelledby="timeline-heading" className="flex flex-col gap-3" data-testid="observation-timeline">
      <h2 id="timeline-heading" className="text-lg font-semibold">
        Observation timeline
      </h2>
      <ol className="flex flex-col gap-3">
        {props.timeline.map((observation) => (
          <li
            key={observation.observationId}
            className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <time dateTime={observation.observedAt} className="text-sm font-medium">
                {observation.observedAt}
              </time>
              <span className="font-mono text-xs text-subtle">{observation.contentHash.slice(0, 12)}…</span>
            </div>
            <dl className="mt-2 grid gap-1 text-xs text-muted sm:grid-cols-2">
              <div>
                <dt className="inline text-subtle">Status: </dt>
                <dd className="inline">{observation.declarationStatus}</dd>
              </div>
              <div>
                <dt className="inline text-subtle">Fetch: </dt>
                <dd className="inline">{observation.fetchOutcome}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="inline text-subtle">TOML: </dt>
                <dd className="inline break-all">{observation.exactLinks.stellarTomlUrl ?? "—"}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="inline text-subtle">Issuer ledger: </dt>
                <dd className="inline">
                  seq {observation.issuerLedgerRef.sequence ?? "—"}
                  {observation.issuerLedgerRef.lastModifiedLedger != null
                    ? ` · ledger ${observation.issuerLedgerRef.lastModifiedLedger}`
                    : ""}
                </dd>
              </div>
            </dl>
          </li>
        ))}
      </ol>
    </section>
  );
}
