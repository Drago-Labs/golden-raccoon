import type { DiscoveryCoverage as Coverage } from "@/server/research/allowance-inventory/schema";

export function DiscoveryCoverage({ coverage }: { coverage: Coverage }) {
  const color = coverage.state === "complete" ? "border-emerald-300/30 bg-emerald-500/8" : coverage.state === "partial" ? "border-amber-300/30 bg-amber-500/8" : "border-red-300/30 bg-red-500/8";
  return (
    <section aria-labelledby="coverage-title" className={`rounded-2xl border p-5 ${color}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="coverage-title" className="text-lg font-semibold">Discovery coverage</h2>
        <span className="rounded-full border border-current/20 px-3 py-1 text-xs uppercase">{coverage.state}</span>
      </div>
      <p className="mt-2 text-sm leading-6 text-white/65">{coverage.message}</p>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div><dt className="text-white/42">Range</dt><dd>{coverage.fromBlock}–{coverage.toBlock ?? "unavailable"}</dd></div>
        <div><dt className="text-white/42">Snapshot</dt><dd>{coverage.snapshotBlock ?? "unavailable"}</dd></div>
        <div><dt className="text-white/42">Candidates</dt><dd>{coverage.candidateCount}</dd></div>
        <div><dt className="text-white/42">Skipped reads</dt><dd>{coverage.skippedCalls}</dd></div>
      </dl>
      {coverage.providerLimitations.length > 0 ? <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-white/60">{coverage.providerLimitations.map((item) => <li key={item}>{item}</li>)}</ul> : null}
    </section>
  );
}
