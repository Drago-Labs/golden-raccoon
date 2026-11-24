import type { ValidityWindow } from "@/server/research/tx-preconditions/schema";

export function ValidityTimeline({ window }: { window: ValidityWindow }) {
  return (
    <section data-testid="validity-timeline" className="rounded-2xl border border-white/10 bg-white/4 p-4 text-sm">
      <h2 className="text-lg font-semibold">Validity window</h2>
      <dl className="mt-3 grid gap-2 sm:grid-cols-2">
        <div>
          <dt className="text-muted">Earliest submit</dt>
          <dd>{window.earliestSubmitAt ?? "unbounded"}</dd>
        </div>
        <div>
          <dt className="text-muted">Latest submit</dt>
          <dd>{window.latestSubmitAt ?? "unbounded"}</dd>
        </div>
        <div>
          <dt className="text-muted">Earliest ledger</dt>
          <dd>{window.earliestLedger ?? "unbounded"}</dd>
        </div>
        <div>
          <dt className="text-muted">Latest ledger</dt>
          <dd>{window.latestLedger ?? "unbounded"}</dd>
        </div>
      </dl>
      <p className="mt-3" data-testid="validity-current">
        Currently valid: {window.currentlyValid ? "yes" : "no"}
      </p>
      {window.invalidReasons.length > 0 ? (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
          {window.invalidReasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
