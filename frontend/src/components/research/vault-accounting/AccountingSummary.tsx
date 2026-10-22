import type { VaultAccountingResult } from "@/server/research/vault-accounting";

function formatSharePrice(result: VaultAccountingResult): string {
  if (!result.sharePrice) return "unavailable";
  const scaled = BigInt(result.sharePrice.assetsPerShareScaled);
  const scale = BigInt(result.sharePrice.scale);
  const whole = scaled / scale;
  const fraction = scaled % scale;
  return `${whole}.${fraction.toString().padStart(scale.toString().length - 1, "0").slice(0, 6)} assets/share (scaled)`;
}

export function AccountingSummary(props: { result: VaultAccountingResult }) {
  const { result } = props;
  const underlying = result.underlyingBalance;

  return (
    <div className="space-y-4">
      <dl className="grid gap-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-white/50">Underlying asset</dt>
          <dd className="font-mono text-xs">{result.asset ?? "unavailable"}</dd>
        </div>
        <div>
          <dt className="text-white/50">Total assets</dt>
          <dd className="font-mono text-xs">{result.totalAssets ?? "unavailable"}</dd>
        </div>
        <div>
          <dt className="text-white/50">Total supply</dt>
          <dd className="font-mono text-xs">{result.totalSupply ?? "unavailable"}</dd>
        </div>
        <div>
          <dt className="text-white/50">Share price</dt>
          <dd className="font-mono text-xs">{formatSharePrice(result)}</dd>
        </div>
        <div>
          <dt className="text-white/50">Block</dt>
          <dd>{result.blockNumber ?? "unavailable"}</dd>
        </div>
      </dl>

      {underlying && (
        <div className="rounded-lg border border-white/10 p-4 text-sm">
          <h3 className="font-medium">Underlying balance comparison</h3>
          <p className="mt-1 text-xs text-white/55">
            How much of the underlying asset the vault contract directly holds, versus what it reports as{" "}
            <code>totalAssets()</code>. A gap is not proof of a problem on its own — a vault may deploy capital into a
            strategy — but it is exactly what an inflated <code>totalAssets</code> or a donation-based price
            manipulation would also look like.
          </p>
          <dl className="mt-3 grid gap-3 sm:grid-cols-3">
            <div>
              <dt className="text-white/50">Directly held</dt>
              <dd className="font-mono text-xs">{underlying.actualBalance ?? "unavailable"}</dd>
            </div>
            <div>
              <dt className="text-white/50">Reported (totalAssets)</dt>
              <dd className="font-mono text-xs">{underlying.totalAssets ?? "unavailable"}</dd>
            </div>
            <div>
              <dt className="text-white/50">Assets held elsewhere</dt>
              <dd className={`font-mono text-xs ${underlying.deficit ? "text-amber-300" : ""}`}>
                {underlying.assetsElsewhere ?? "unavailable"}
              </dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  );
}
