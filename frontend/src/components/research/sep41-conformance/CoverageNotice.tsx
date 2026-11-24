import type { CoverageNotice as CoverageNoticeData } from "@/server/research/sep41-conformance";

export function CoverageNotice(props: { coverage: CoverageNoticeData }) {
  const { coverage } = props;

  return (
    <div className="space-y-3 rounded-lg border border-white/10 p-4 text-xs text-white/70" aria-label="Coverage notice">
      <h3 className="text-sm font-medium text-white">Coverage</h3>
      <p>{coverage.message}</p>
      <dl className="grid gap-2 sm:grid-cols-2">
        <div>
          <dt className="text-white/50">Reference</dt>
          <dd className="font-mono">{coverage.referenceVersion}</dd>
        </div>
        <div>
          <dt className="text-white/50">Provider reached</dt>
          <dd>{coverage.reachedProvider ? "Yes" : "No"}</dd>
        </div>
        <div>
          <dt className="text-white/50">Interface</dt>
          <dd>
            {coverage.interfaceMatches} match / {coverage.interfaceMissing} missing /{" "}
            {coverage.interfaceMismatched} mismatched / {coverage.interfaceExtra} extra
          </dd>
        </div>
        <div>
          <dt className="text-white/50">Simulations</dt>
          <dd>
            {coverage.simulationsOk} of {coverage.simulationsAttempted} ok
          </dd>
        </div>
        <div>
          <dt className="text-white/50">Events sampled</dt>
          <dd>{coverage.eventsSampled}</dd>
        </div>
        <div>
          <dt className="text-white/50">Event shape failures</dt>
          <dd>{coverage.eventShapeFailures}</dd>
        </div>
      </dl>
    </div>
  );
}
