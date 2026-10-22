import type { MerkleClaimsResult } from "@/server/research/merkle-claims";

export function ClaimStatus(props: { result: MerkleClaimsResult }) {
  const { claim } = props.result;

  return (
    <div className={`rounded-lg border p-4 text-sm ${claim.eligible ? "border-emerald-500/30 bg-emerald-500/10" : "border-amber-500/30 bg-amber-500/10"}`}>
      <h3 className="font-medium">{claim.eligible ? "Eligible" : "Not eligible"}</h3>
      <p className="mt-1 text-xs text-white/70">{claim.reason}</p>
      <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
        <div>
          <dt className="text-white/50">In tree</dt>
          <dd>{claim.inTree ? "Yes" : "No"}</dd>
        </div>
        <div>
          <dt className="text-white/50">Proof valid</dt>
          <dd>{claim.proofValid ? "Yes" : "No"}</dd>
        </div>
        <div>
          <dt className="text-white/50">Already claimed</dt>
          <dd>{claim.alreadyClaimed === null ? "Unknown" : claim.alreadyClaimed ? "Yes" : "No"}</dd>
        </div>
      </dl>
    </div>
  );
}
