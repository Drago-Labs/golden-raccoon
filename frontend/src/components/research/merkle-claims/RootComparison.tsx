import type { MerkleClaimsResult } from "@/server/research/merkle-claims";

export function RootComparison(props: { result: MerkleClaimsResult }) {
  const { result } = props;
  const matches = result.claim.fileReportedRootMatchesChain;

  return (
    <div className="space-y-3 text-sm">
      <dl className="grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-white/50">On-chain merkleRoot()</dt>
          <dd className="break-all font-mono text-xs">{result.onChainRoot ?? "could not be read"}</dd>
        </div>
        <div>
          <dt className="text-white/50">Tree file&apos;s self-reported root</dt>
          <dd className="break-all font-mono text-xs">{result.tree.fileReportedRoot ?? "tree not loaded"}</dd>
        </div>
      </dl>
      <p className={`text-xs ${matches === false ? "text-amber-300" : "text-white/55"}`}>
        {matches === null
          ? "Not compared — the on-chain root or the tree file was unavailable."
          : matches
            ? "The tree file's self-reported root matches the on-chain root (a cheap sanity check only — a tampered file can self-report any root)."
            : "The tree file's self-reported root does NOT match the on-chain root. This alone does not prove a tamper, but the only trustworthy check is the cryptographic proof below."}
      </p>
    </div>
  );
}
