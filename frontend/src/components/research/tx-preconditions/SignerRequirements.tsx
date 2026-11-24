import type { SignerRequirement } from "@/server/research/tx-preconditions/schema";

export function SignerRequirements({ signers }: { signers: SignerRequirement[] }) {
  if (signers.length === 0) {
    return (
      <section data-testid="signer-requirements" className="rounded-2xl border border-white/10 bg-white/4 p-4 text-sm">
        <h2 className="text-lg font-semibold">Extra signers</h2>
        <p className="mt-2 text-muted">No extra signers are required by this envelope.</p>
      </section>
    );
  }

  return (
    <section data-testid="signer-requirements" className="rounded-2xl border border-white/10 bg-white/4 p-4 text-sm">
      <h2 className="text-lg font-semibold">Extra signers</h2>
      <ul className="mt-3 space-y-3">
        {signers.map((signer) => (
          <li key={signer.key} className="rounded-xl border border-white/8 p-3">
            <p className="font-mono text-xs break-all">{signer.key}</p>
            <p className="mt-1 text-muted">
              Kind: {signer.kind}. Signature present: {signer.signaturePresent ? "yes" : "no"}. Can be satisfied as
              pasted: {signer.canBeSatisfied ? "yes" : "no"}.
            </p>
            <p className="mt-1 text-muted">{signer.note}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
