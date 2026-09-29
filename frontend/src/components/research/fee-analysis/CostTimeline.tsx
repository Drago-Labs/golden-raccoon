import { formatBaseUnits } from "@/server/research/fee-analysis/unitMath";
import type { TimelinePoint } from "@/server/research/fee-analysis/schema";

/**
 * Fees over time, as a table with proportional bars.
 *
 * The bar is decoration; the number beside it is the fact. A reader on a
 * screen reader, in high contrast, or on a narrow phone gets the same
 * information from the table that a sighted reader gets from the bars.
 *
 * Each bar is scaled within its own asset, because comparing a bar of wei
 * against a bar of stroops would be a picture of nothing.
 */
export function CostTimeline({ timeline }: { timeline: TimelinePoint[] }) {
  if (timeline.length === 0) {
    return (
      <p data-testid="timeline-empty" className="text-sm text-white/54">
        No charge in this window carries a timestamp, so there is nothing to place on a timeline.
      </p>
    );
  }

  const maxByAsset = new Map<string, bigint>();

  for (const point of timeline) {
    for (const asset of point.byAsset) {
      const key = `${asset.asset.network}:${asset.asset.kind}`;
      const value = BigInt(asset.observedBaseUnits || "0");
      const current = maxByAsset.get(key) ?? 0n;

      if (value > current) maxByAsset.set(key, value);
    }
  }

  return (
    <div data-testid="cost-timeline" className="overflow-x-auto">
      <table className="w-full min-w-[30rem] border-collapse text-left text-sm">
        <caption className="sr-only">Observed fees per period, per asset</caption>
        <thead>
          <tr className="text-xs uppercase tracking-[0.12em] text-white/42">
            <th scope="col" className="py-2 pr-4 font-medium">
              Period
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              Asset
            </th>
            <th scope="col" className="py-2 font-medium">
              Observed
            </th>
          </tr>
        </thead>
        <tbody>
          {timeline.map((point) =>
            point.byAsset.map((asset) => {
              const key = `${asset.asset.network}:${asset.asset.kind}`;
              const max = maxByAsset.get(key) ?? 0n;
              const value = BigInt(asset.observedBaseUnits || "0");
              const percent = max > 0n ? Number((value * 100n) / max) : 0;

              return (
                <tr key={`${point.startsAt}-${key}`} className="border-t border-white/8">
                  <td className="py-3 pr-4 text-xs text-white/54">{point.startsAt.slice(0, 10)}</td>
                  <td className="py-3 pr-4 text-xs text-white/54">
                    {asset.asset.symbol} · {asset.asset.network}
                  </td>
                  <td className="py-3">
                    <span className="font-mono text-white/78 tabular-nums">
                      {formatBaseUnits(asset.observedBaseUnits, asset.asset.decimals)}
                    </span>
                    <span aria-hidden="true" className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-white/8">
                      <span className="block h-full rounded-full bg-[#d9a441]" style={{ width: `${percent}%` }} />
                    </span>
                  </td>
                </tr>
              );
            }),
          )}
        </tbody>
      </table>
    </div>
  );
}
