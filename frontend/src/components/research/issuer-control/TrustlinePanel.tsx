import type { IssuerControlResult } from "@/server/research/issuer-control/schema";

export function TrustlinePanel({ result }: { result: IssuerControlResult }) {
  const trustline = result.trustline;
  return (
    <section aria-labelledby="trustline-heading" className="rounded-2xl border border-white/10 p-4">
      <h2 id="trustline-heading" className="text-lg font-semibold">
        Account trustline state
      </h2>
      <p className="mt-1 text-sm text-white/55">{trustline.note}</p>
      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-white/45">State</dt>
          <dd>{trustline.state}</dd>
        </div>
        <div>
          <dt className="text-white/45">Account</dt>
          <dd className="break-all font-mono text-xs">{trustline.account}</dd>
        </div>
        <div>
          <dt className="text-white/45">Balance</dt>
          <dd className="font-mono text-xs">{trustline.balance ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-white/45">Limit</dt>
          <dd className="font-mono text-xs">{trustline.limit ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-white/45">Buying liabilities</dt>
          <dd className="font-mono text-xs">{trustline.buyingLiabilities ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-white/45">Selling liabilities</dt>
          <dd className="font-mono text-xs">{trustline.sellingLiabilities ?? "—"}</dd>
        </div>
      </dl>
      <p className="mt-3 text-xs text-white/45">
        Asset {trustline.assetKey} · ledger {trustline.ledger ?? "unavailable"} · source {trustline.source ?? "unavailable"}
      </p>
    </section>
  );
}
