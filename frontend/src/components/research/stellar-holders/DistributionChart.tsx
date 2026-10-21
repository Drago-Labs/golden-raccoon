"use client";

import { formatSharePercent } from "@/server/research/stellar-holders/concentration";
import type { HolderRow } from "@/server/research/stellar-holders/schema";

/**
 * Bar chart of each holder's share of account supply.
 *
 * The graphic is hidden from assistive tech. The ordered list under it states
 * the same shares in text, so the distribution is readable without the bars.
 */
export function DistributionChart({ holders }: { holders: HolderRow[] }) {
  if (holders.length === 0) {
    return <p className="text-sm text-white/60">No positive trustline balances to chart.</p>;
  }

  return (
    <figure className="space-y-3" aria-labelledby="distribution-chart-title">
      <figcaption id="distribution-chart-title" className="text-sm font-semibold">
        Share of account supply
      </figcaption>
      <div aria-hidden="true" data-testid="distribution-chart" className="space-y-2">
        {holders.map((holder) => (
          <div key={holder.accountId} className="grid grid-cols-[minmax(0,1fr)_4.5rem] items-center gap-3">
            <div className="h-3 overflow-hidden rounded-full bg-white/10">
              <div className="h-3 rounded-full bg-[#d9a441]" style={{ width: formatSharePercent(holder.shareOfAccounts) }} />
            </div>
            <span className="text-right text-xs tabular-nums text-white/70">{formatSharePercent(holder.shareOfAccounts)}</span>
          </div>
        ))}
      </div>
      <ol data-testid="distribution-text-alternative" className="space-y-1 text-sm">
        {holders.map((holder) => (
          <li key={holder.accountId}>
            <span className="font-mono text-xs">{holder.accountId}</span>
            {` holds ${holder.balance} (${formatSharePercent(holder.shareOfAccounts)} of account supply, ${ratioText(holder.shareOfAccounts)}).`}
          </li>
        ))}
      </ol>
    </figure>
  );
}

function ratioText(ratio: { numerator: string; denominator: string }): string {
  return `${ratio.numerator}/${ratio.denominator}`;
}
