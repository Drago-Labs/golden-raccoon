"use client";

import { StatusBadge } from "@/components/a11y/StatusBadge";
import type { AssetIdentity, LadderRung } from "@/server/research/liquidity-depth/schema";

const statusLabel: Record<LadderRung["status"], string> = {
  filled: "Covered by the snapshot",
  partial: "Partly visible",
  insufficient_depth: "No visible depth",
  not_modelled: "Not modelled",
};

const statusTone: Record<LadderRung["status"], "success" | "warning" | "danger" | "neutral"> = {
  filled: "success",
  partial: "warning",
  insufficient_depth: "danger",
  not_modelled: "neutral",
};

/** Renders an integer base-unit amount at its asset's own scale. */
function formatUnits(amount: string, decimals: number): string {
  const padded = amount.padStart(decimals + 1, "0");
  const whole = padded.slice(0, padded.length - decimals) || "0";
  const fraction = decimals > 0 ? padded.slice(padded.length - decimals).replace(/0+$/, "") : "";

  return fraction ? `${whole}.${fraction}` : whole;
}

/**
 * The size ladder: what each trade size costs on this venue.
 *
 * Amounts are rendered from integer base units at the asset's own scale, so no
 * digit is lost between the calculation and the screen.
 */
export function SizeLadder({
  ladder,
  base,
  quote,
}: {
  ladder: LadderRung[];
  base: AssetIdentity;
  quote: AssetIdentity;
}) {
  if (ladder.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-white/15 px-4 py-6 text-sm text-subtle">
        No size was evaluated for this venue.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[46rem] border-collapse text-left text-sm">
        <caption className="py-2 text-left text-xs text-subtle">
          Capacity by trade size on this venue alone. No routing across venues is performed.
        </caption>
        <thead>
          <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-subtle">
            <th scope="col" className="py-2 pr-3">Size ({base.symbol})</th>
            <th scope="col" className="py-2 pr-3">Fillable</th>
            <th scope="col" className="py-2 pr-3">{quote.symbol} amount</th>
            <th scope="col" className="py-2 pr-3">Effective price</th>
            <th scope="col" className="py-2 pr-3">Impact</th>
            <th scope="col" className="py-2 pr-3">Status</th>
          </tr>
        </thead>
        <tbody>
          {ladder.map((rung) => (
            <tr key={rung.requestedBaseAmount} className="border-b border-white/5 align-top">
              <th scope="row" className="py-2 pr-3 font-medium tabular-nums">
                {formatUnits(rung.requestedBaseAmount, base.decimals)}
              </th>
              <td className="py-2 pr-3 text-xs tabular-nums">{formatUnits(rung.fillableBaseAmount, base.decimals)}</td>
              <td className="py-2 pr-3 text-xs tabular-nums">
                {rung.quoteAmount === null ? (
                  <span className="text-subtle">Not derivable</span>
                ) : (
                  formatUnits(rung.quoteAmount, quote.decimals)
                )}
              </td>
              <td className="py-2 pr-3 text-xs tabular-nums">
                {rung.effectivePrice ?? <span className="text-subtle">Not derivable</span>}
              </td>
              <td className="py-2 pr-3 text-xs tabular-nums">
                {rung.priceImpactBps === null ? (
                  <span className="text-subtle">Not derivable</span>
                ) : (
                  `${rung.priceImpactBps} bps`
                )}
              </td>
              <td className="py-2 pr-3 text-xs">
                <StatusBadge tone={statusTone[rung.status]}>{statusLabel[rung.status]}</StatusBadge>
                <span className="mt-1 block text-subtle">{rung.note}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
