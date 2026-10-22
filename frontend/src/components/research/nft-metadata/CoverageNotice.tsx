import type { CoverageNotice as CoverageNoticeData } from "@/server/research/nft-metadata";

export function CoverageNotice(props: { coverage: CoverageNoticeData; warnings: string[] }) {
  const { coverage, warnings } = props;

  return (
    <div className="space-y-3 rounded-lg border border-white/10 p-4 text-xs text-white/70">
      <h3 className="text-sm font-medium text-white">Coverage</h3>
      <dl className="grid gap-2 sm:grid-cols-2">
        <div>
          <dt className="text-white/50">Standard detected</dt>
          <dd>{coverage.standardDetected ? "Yes" : "No"}</dd>
        </div>
        <div>
          <dt className="text-white/50">Samples resolved</dt>
          <dd>
            {coverage.resolvedSamples} of {coverage.sampledTokens}
          </dd>
        </div>
        <div>
          <dt className="text-white/50">Metadata-update event scan</dt>
          <dd>{coverage.metadataUpdateScanTruncated ? "Truncated to a bounded lookback" : "Covered the full chain history"}</dd>
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
