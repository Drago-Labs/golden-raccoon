import { formatBaseUnits } from "@/server/research/fee-analysis/unitMath";
import type { AssetTotal } from "@/server/research/fee-analysis/schema";

/**
 * Per-asset totals.
 *
 * There is no "total" column spanning assets, and that absence is the point:
 * the component has no way to render one, so a mixed-asset report cannot grow
 * a misleading single figure by accident. A fiat column appears only for rows
 * that carry the price and the time it was true.
 */
export function FeeBreakdown({ totals, caption }: { totals: AssetTotal[]; caption: string }) {
  if (totals.length === 0) {
    return <p className="text-sm text-white/54">No charge in this grouping.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="text-xs uppercase tracking-[0.12em] text-white/42">
            <th scope="col" className="py-2 pr-4 font-medium">
              Asset
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              Observed total
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              Charges
            </th>
            <th scope="col" className="py-2 font-medium">
              In USD
            </th>
          </tr>
        </thead>
        <tbody>
          {totals.map((total) => (
            <tr key={`${total.asset.network}-${total.asset.kind}`} className="border-t border-white/8 align-top">
              <td className="py-3 pr-4">
                <span className="text-white/80">{total.asset.symbol}</span>
                <span className="mt-0.5 block text-xs text-white/42">{total.asset.network}</span>
              </td>
              <td className="py-3 pr-4 font-mono text-white/78 tabular-nums">
                {formatBaseUnits(total.observedBaseUnits, total.asset.decimals)}
              </td>
              <td className="py-3 pr-4 text-xs text-white/54">
                {total.observedCount} observed
                {total.unknownCount > 0 ? (
                  <span className="mt-0.5 block text-[#f2c86d]">
                    {total.unknownCount} not readable, counted but not valued
                  </span>
                ) : null}
              </td>
              <td className="py-3 text-xs">
                {total.fiat ? (
                  <>
                    <span className="font-mono text-white/78 tabular-nums">${total.fiat.amount.toFixed(2)}</span>
                    <span className="mt-0.5 block text-white/42">
                      at ${total.fiat.unitPriceUsd} per {total.asset.symbol}, priced{" "}
                      {new Date(total.fiat.pricedAt).toISOString().slice(0, 10)}
                    </span>
                  </>
                ) : (
                  <span className="text-white/42">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
