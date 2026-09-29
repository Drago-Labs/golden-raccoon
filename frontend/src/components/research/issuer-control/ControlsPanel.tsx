import type { IssuerControlResult } from "@/server/research/issuer-control/schema";

export function ControlsPanel({ result }: { result: IssuerControlResult }) {
  const flags = result.issuerFlags;
  return (
    <section aria-labelledby="issuer-controls-heading" className="rounded-2xl border border-white/10 p-4">
      <h2 id="issuer-controls-heading" className="text-lg font-semibold">
        Current issuer controls
      </h2>
      <p className="mt-1 text-sm text-white/55">{flags.note}</p>
      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-white/45">State</dt>
          <dd>{flags.state}</dd>
        </div>
        <div>
          <dt className="text-white/45">Issuer</dt>
          <dd className="break-all font-mono text-xs">{flags.issuer ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-white/45">auth_required</dt>
          <dd>{flags.authRequired === null ? "—" : String(flags.authRequired)}</dd>
        </div>
        <div>
          <dt className="text-white/45">auth_revocable</dt>
          <dd>{flags.authRevocable === null ? "—" : String(flags.authRevocable)}</dd>
        </div>
        <div>
          <dt className="text-white/45">auth_immutable</dt>
          <dd>{flags.authImmutable === null ? "—" : String(flags.authImmutable)}</dd>
        </div>
        <div>
          <dt className="text-white/45">auth_clawback_enabled</dt>
          <dd>{flags.authClawbackEnabled === null ? "—" : String(flags.authClawbackEnabled)}</dd>
        </div>
      </dl>
      <p className="mt-3 text-xs text-white/45">
        Network {result.network} · ledger {flags.ledger ?? "unavailable"} · source {flags.source ?? "unavailable"}
      </p>
    </section>
  );
}
