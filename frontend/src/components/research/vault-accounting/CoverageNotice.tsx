import type { CoverageNotice as CoverageNoticeData } from "@/server/research/vault-accounting";

export function CoverageNotice(props: { coverage: CoverageNoticeData; warnings: string[] }) {
  const { coverage, warnings } = props;

  return (
    <div className="space-y-3 rounded-lg border border-white/10 p-4 text-xs text-white/70">
      <h3 className="text-sm font-medium text-white">Coverage</h3>
      <dl className="grid gap-2 sm:grid-cols-2">
        <div>
          <dt className="text-white/50">Vault conformance</dt>
          <dd>
            {coverage.conformance.conforming
              ? "Fully conforming"
              : `Missing: ${coverage.conformance.missing.join(", ") || "unknown"}`}
          </dd>
        </div>
        <div>
          <dt className="text-white/50">Rounding samples</dt>
          <dd>
            {coverage.roundingSamplesAvailable} of {coverage.roundingSamplesRequested} available
          </dd>
        </div>
        <div>
          <dt className="text-white/50">Price samples</dt>
          <dd>
            {coverage.priceSamplesAvailable} of {coverage.priceSamplesRequested} available
          </dd>
        </div>
        <div>
          <dt className="text-white/50">Provider reached</dt>
          <dd>{coverage.reachedProvider ? "Yes" : "No"}</dd>
        </div>
      </dl>

      {warnings.length > 0 && (
        <ul className="space-y-1 rounded-lg border border-amber-500/25 bg-amber-500/5 p-3 text-amber-200">
          {warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
