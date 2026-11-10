import type { CoverageNotice as CoverageNoticeData } from "@/server/research/volatility-profile";

export function CoverageNotice(props: { coverage: CoverageNoticeData; warnings: string[] }) {
  const { coverage, warnings } = props;
  return (
    <div className="space-y-3 rounded-lg border border-white/10 p-4 text-xs text-white/70">
      <h3 className="text-sm font-medium text-white">Coverage</h3>
      <dl className="grid gap-2 sm:grid-cols-3">
        <div>
          <dt className="text-white/50">Source</dt>
          <dd>{coverage.source}</dd>
        </div>
        <div>
          <dt className="text-white/50">Observations</dt>
          <dd>
            {coverage.observationsRead} ({coverage.validReturnSteps} return steps)
          </dd>
        </div>
        <div>
          <dt className="text-white/50">Gaps detected</dt>
          <dd>{coverage.gapsDetected}</dd>
        </div>
      </dl>
      {warnings.length > 0 && (
        <ul className="space-y-1 rounded border border-amber-500/25 bg-amber-500/5 p-3 text-amber-200">
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
