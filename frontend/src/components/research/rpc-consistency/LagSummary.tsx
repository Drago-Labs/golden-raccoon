import type { LagSummary as LagSummaryModel } from "@/server/research/rpc-consistency/schema";

/** How far apart the answers are. A gap is described as lag, not as a disagreement about value. */
export function LagSummary({ lag }: { lag: LagSummaryModel }) {
  return (
    <section aria-labelledby="lag-summary-heading" data-testid="lag-summary" className="min-w-0">
      <h2 id="lag-summary-heading" className="text-lg font-semibold">
        Lag
      </h2>
      <p className="mt-3 text-sm leading-6 text-white/70">{lag.note}</p>
      <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs uppercase tracking-[0.12em] text-white/45">Lagging fields</dt>
          <dd>{lag.laggingFieldCount}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-[0.12em] text-white/45">Largest field gap</dt>
          <dd>{lag.largestFieldGap == null ? "None" : `${lag.largestFieldGap} ledgers`}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-[0.12em] text-white/45">Latest-ledger gap</dt>
          <dd>{lag.providerLedgerGap == null ? "Not reported" : `${lag.providerLedgerGap} ledgers`}</dd>
        </div>
      </dl>
    </section>
  );
}
