import { formatSharePercent } from "@/server/research/counterparty-flows/concentration";
import type { ConcentrationSlice, CounterpartyAssetTotal } from "@/server/research/counterparty-flows/schema";

type FlowChartProps = {
  totals: CounterpartyAssetTotal[];
  concentration: ConcentrationSlice[];
};

/**
 * Visual share bars for outflow concentration, with a text alternative for the same figures.
 */
export function FlowChart({ totals, concentration }: FlowChartProps) {
  const outflow = totals.filter((row) => row.direction === "out").slice(0, 8);
  const primary = concentration.find((slice) => slice.direction === "out") ?? concentration[0];

  if (outflow.length === 0) {
    return (
      <p data-testid="flow-chart-empty" className="text-sm text-muted">
        No outflow volume to chart in this window.
      </p>
    );
  }

  const max = Math.max(...outflow.map((row) => Number(row.amount) || 0), 1);

  return (
    <figure className="space-y-3" aria-labelledby="flow-chart-title">
      <figcaption id="flow-chart-title" className="text-sm font-semibold">
        Outflow by counterparty
      </figcaption>
      <div aria-hidden="true" data-testid="flow-chart" className="space-y-2">
        {outflow.map((row) => {
          const width = `${Math.max(4, Math.round((Number(row.amount) / max) * 100))}%`;
          return (
            <div key={`${row.asset}-${row.counterparty}`} className="grid grid-cols-[minmax(0,1fr)_6rem] items-center gap-3">
              <div className="h-3 overflow-hidden rounded-full bg-white/10">
                <div className="h-3 rounded-full bg-[#d9a441]" style={{ width }} />
              </div>
              <span className="text-right text-xs tabular-nums text-white/70">{row.amount}</span>
            </div>
          );
        })}
      </div>
      <ol data-testid="flow-chart-text-alternative" className="space-y-1 text-sm">
        {outflow.map((row) => (
          <li key={`text-${row.asset}-${row.counterparty}`}>
            <span className="font-mono text-xs">{row.counterparty}</span>
            {row.label ? ` (${row.label})` : ""}
            {` received ${row.amount} ${row.asset} across ${row.eventCount} event(s).`}
          </li>
        ))}
      </ol>
      {primary?.defined ? (
        <p className="text-xs text-subtle">
          Top-1 share {formatSharePercent(primary.topShares.find((share) => share.n === 1)?.share ?? { numerator: "0", denominator: "0" })}
          {"; "}
          Herfindahl {primary.herfindahl.numerator}/{primary.herfindahl.denominator}.
        </p>
      ) : null}
    </figure>
  );
}
