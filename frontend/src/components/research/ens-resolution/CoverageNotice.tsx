import type { CoverageNotice as CoverageNoticeData } from "@/server/research/ens-resolution";

export function CoverageNotice(props: { coverage: CoverageNoticeData; warnings: string[] }) {
  const { coverage, warnings } = props;
  return (
    <div className="space-y-3 rounded-lg border border-white/10 p-4 text-xs text-white/70">
      <h3 className="text-sm font-medium text-white">Coverage</h3>
      <dl className="grid gap-2 sm:grid-cols-3">
        <div>
          <dt className="text-white/50">Recorded block</dt>
          <dd>{coverage.recordedBlock ?? "n/a"}</dd>
        </div>
        <div>
          <dt className="text-white/50">Forward resolved</dt>
          <dd>{coverage.forwardResolved ? "Yes" : "No"}</dd>
        </div>
        <div>
          <dt className="text-white/50">Reverse resolved</dt>
          <dd>{coverage.reverseResolved ? "Yes" : "No"}</dd>
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
