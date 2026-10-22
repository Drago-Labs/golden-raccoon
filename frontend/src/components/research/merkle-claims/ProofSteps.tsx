import type { MerkleClaimsResult } from "@/server/research/merkle-claims";

export function ProofSteps(props: { result: MerkleClaimsResult }) {
  const { result } = props;
  const { tree, proof } = result;

  if (!tree.loaded) {
    return <p className="text-xs text-white/55">The tree file could not be loaded, so no proof could be checked.</p>;
  }
  if (tree.entryIndex === null) {
    return <p className="text-xs text-white/55">This address has no entry in the loaded tree file.</p>;
  }

  return (
    <dl className="grid gap-3 text-xs sm:grid-cols-2">
      <div>
        <dt className="text-white/50">Entry index</dt>
        <dd className="font-mono">{tree.entryIndex}</dd>
      </div>
      <div>
        <dt className="text-white/50">Claim amount</dt>
        <dd className="font-mono">{tree.entryAmount}</dd>
      </div>
      <div>
        <dt className="text-white/50">Proof length</dt>
        <dd>{tree.proofLength} sibling(s)</dd>
      </div>
      <div>
        <dt className="text-white/50">Computed leaf</dt>
        <dd className="break-all font-mono">{proof.leaf ?? "not computed"}</dd>
      </div>
      <div className="sm:col-span-2">
        <dt className="text-white/50">Folded (computed) root</dt>
        <dd className="break-all font-mono">{proof.computedRoot ?? "not computed"}</dd>
      </div>
      <div className="sm:col-span-2">
        <dt className="text-white/50">Result</dt>
        <dd className={proof.valid ? "text-emerald-300" : "text-amber-300"}>
          {proof.valid ? "Valid — " : "Invalid — "}
          {proof.reason}
        </dd>
      </div>
    </dl>
  );
}
