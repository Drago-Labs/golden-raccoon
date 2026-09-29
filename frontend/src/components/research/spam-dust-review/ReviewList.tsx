"use client";

import { StatusBadge } from "@/components/a11y/StatusBadge";
import type { HoldingReview } from "@/server/research/spam-dust-review/schema";

/**
 * Accessible review list. Hidden items stay listed so they remain discoverable.
 */
export function ReviewList({
  holdings,
  onToggleHidden,
}: {
  holdings: HoldingReview[];
  onToggleHidden: (assetKey: string, hidden: boolean) => void;
}) {
  if (holdings.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-white/15 px-4 py-6 text-sm text-subtle">
        No holdings to review for this wallet and chain.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[48rem] border-collapse text-left text-sm">
        <caption className="py-2 text-left text-xs text-subtle">
          Spam and dust review. Hidden assets remain listed and count toward balance uncertainty.
        </caption>
        <thead>
          <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-subtle">
            <th scope="col" className="py-2 pr-3">Asset</th>
            <th scope="col" className="py-2 pr-3">Value</th>
            <th scope="col" className="py-2 pr-3">Signals</th>
            <th scope="col" className="py-2 pr-3">Visibility</th>
          </tr>
        </thead>
        <tbody>
          {holdings.map((holding) => (
            <tr key={holding.assetKey} data-testid={`holding-${holding.assetKey}`} className={holding.hidden ? "opacity-70" : undefined}>
              <th scope="row" className="py-3 pr-3 align-top font-medium">
                {holding.symbol}
                <p className="mt-1 text-xs font-normal text-subtle">{holding.name}</p>
                <p className="mt-1 font-mono text-[11px] font-normal text-subtle">{holding.chainId}</p>
              </th>
              <td className="py-3 pr-3 align-top text-xs">
                {holding.priceUsd === null ? "Unpriced" : `$${holding.valueUsd.toFixed(4)}`}
                <p className="mt-1 text-subtle">Balance {holding.balance}</p>
              </td>
              <td className="py-3 pr-3 align-top">
                {holding.signals.length === 0 ? (
                  <StatusBadge tone="success">clean</StatusBadge>
                ) : (
                  <ul className="space-y-1">
                    {holding.signals.map((signal) => (
                      <li key={`${holding.assetKey}-${signal.kind}`}>
                        <StatusBadge tone={signal.kind === "suspicious_link" ? "danger" : "warning"}>
                          {signal.kind.replaceAll("_", " ")} ({Math.round(signal.confidence * 100)}%)
                        </StatusBadge>
                        <p className="mt-1 max-w-[18rem] text-xs text-subtle">{signal.detail}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </td>
              <td className="py-3 pr-3 align-top">
                <button
                  type="button"
                  className="rounded-lg border border-white/15 px-3 py-1.5 text-xs underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                  aria-pressed={holding.hidden}
                  onClick={() => onToggleHidden(holding.assetKey, !holding.hidden)}
                >
                  {holding.hidden ? "Show" : "Hide"}
                </button>
                {holding.hidden ? <p className="mt-1 text-xs text-subtle">Hidden locally</p> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
