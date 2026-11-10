import type { CoverageNotice as CoverageNoticeData } from "@/server/research/event-decoder";

export function CoverageNotice(props: { coverage: CoverageNoticeData; warnings: string[] }) {
  const { coverage, warnings } = props;
  return (
    <div data-testid="coverage-notice" className="space-y-3 rounded-lg border border-white/10 p-4 text-xs text-white/70">
      <h3 className="text-sm font-medium text-white">Retention & Spec Coverage</h3>
      <p>{coverage.message}</p>
      <dl className="grid gap-2 sm:grid-cols-4">
        <div>
          <dt className="text-white/50">Spec loaded</dt>
          <dd>{coverage.specFound ? "Yes" : "No"}</dd>
        </div>
        <div>
          <dt className="text-white/50">Decoded / Unmatched</dt>
          <dd>
            {coverage.eventsDecoded} / {coverage.eventsUnmatched}
          </dd>
        </div>
        <div>
          <dt className="text-white/50">Duplicates removed</dt>
          <dd>{coverage.deduplicatedCount}</dd>
        </div>
        <div>
          <dt className="text-white/50">Outside retention</dt>
          <dd>{coverage.retention?.outsideRetention ? "Yes (Unavailable)" : "No"}</dd>
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
