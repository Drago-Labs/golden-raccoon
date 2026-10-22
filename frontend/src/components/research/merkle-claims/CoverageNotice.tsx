import type { CoverageNotice as CoverageNoticeData } from "@/server/research/merkle-claims";

export function CoverageNotice(props: { coverage: CoverageNoticeData; warnings: string[] }) {
  const { coverage, warnings } = props;

  return (
    <div className="space-y-3 rounded-lg border border-white/10 p-4 text-xs text-white/70">
      <h3 className="text-sm font-medium text-white">Coverage</h3>
      <dl className="grid gap-2 sm:grid-cols-2">
        <div>
          <dt className="text-white/50">On-chain root read</dt>
          <dd>{coverage.onChainRootRead ? "Yes" : "No"}</dd>
        </div>
        <div>
          <dt className="text-white/50">Tree loaded</dt>
          <dd>{coverage.treeLoaded ? "Yes" : "No"}</dd>
        </div>
        <div>
          <dt className="text-white/50">Proof checked</dt>
          <dd>{coverage.proofChecked ? "Yes" : "No"}</dd>
        </div>
        <div>
          <dt className="text-white/50">Claim status read</dt>
          <dd>{coverage.claimStatusRead ? "Yes" : "No"}</dd>
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
