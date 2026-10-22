import type { FundingHop } from "@/server/research/deployer-history";

function formatEth(valueWei: string): string {
  try {
    const wei = BigInt(valueWei);
    const whole = wei / 10n ** 18n;
    const fraction = (wei % 10n ** 18n).toString().padStart(18, "0").slice(0, 6);
    return `${whole}.${fraction} ETH`;
  } catch {
    return valueWei;
  }
}

export function FundingTrail(props: { hops: FundingHop[] }) {
  if (props.hops.length === 0) {
    return <p className="text-xs text-white/55">No funding transactions were found in the scanned window.</p>;
  }

  return (
    <ol className="space-y-3">
      {props.hops.map((hop) => (
        <li key={hop.hop} className="rounded-lg border border-white/10 p-3 text-xs">
          <p className="font-medium text-white/80">
            Hop {hop.hop}: <span className="font-mono">{hop.address}</span>
          </p>
          {hop.transactions.length === 0 ? (
            <p className="mt-1 text-white/55">No incoming value transfer found in the scanned window for this address.</p>
          ) : (
            <ul className="mt-2 space-y-1">
              {hop.transactions.map((tx) => (
                <li key={tx.txHash} className="font-mono text-white/70">
                  {tx.from} → {formatEth(tx.valueWei)} at block {tx.blockNumber}
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ol>
  );
}
