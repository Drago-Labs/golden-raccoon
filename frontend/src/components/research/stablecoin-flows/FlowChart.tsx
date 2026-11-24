import type { ChainCoverage, DailyFlow } from "@/server/research/stablecoin-flows/schema";

/**
 * Daily net issuance per chain. The chart is decorative: every value it draws
 * is also in the table below it, and a chain whose coverage is incomplete is
 * marked in both places rather than only in the picture.
 */
export function FlowChart({
  daily,
  coverage,
  symbol,
}: {
  daily: DailyFlow[];
  coverage: ChainCoverage[];
  symbol: string;
}) {
  const days = [...new Set(daily.map((row) => row.day))].sort();
  const chains = [...new Set(daily.map((row) => row.chain))].sort();
  const value = (day: string, chain: string) => daily.find((row) => row.day === day && row.chain === chain);
  const incomplete = new Set(coverage.filter((row) => row.state !== "complete").map((row) => row.chain));
  const scale = daily.reduce((largest, row) => {
    const size = BigInt(row.netUnits) < 0n ? -BigInt(row.netUnits) : BigInt(row.netUnits);
    return size > largest ? size : largest;
  }, 1n);
  const height = (units: string) => {
    const size = BigInt(units) < 0n ? -BigInt(units) : BigInt(units);
    return Number((size * 100n) / scale);
  };

  return (
    <section className="space-y-3" aria-label="Daily net issuance">
      <h2 className="text-lg font-semibold">Daily net issuance ({symbol})</h2>
      {days.length ? (
        <svg viewBox={`0 0 ${Math.max(days.length * 24, 120)} 120`} role="img" aria-labelledby="flow-chart-title" className="max-h-64 w-full">
          <title id="flow-chart-title">
            Net issuance per UTC day and chain. Mints rise above the zero line and burns fall below it; the data table
            below this chart carries every value.
          </title>
          <line x1="0" x2={Math.max(days.length * 24, 120)} y1="60" y2="60" stroke="currentColor" strokeWidth="0.5" />
          {days.flatMap((day, dayIndex) =>
            chains.map((chain, chainIndex) => {
              const row = value(day, chain);
              if (!row || row.netUnits === "0") return null;
              const size = Math.max(height(row.netUnits) / 2, 1);
              const negative = BigInt(row.netUnits) < 0n;
              const width = Math.max(18 / chains.length, 2);
              return (
                <rect
                  key={`${day}:${chain}`}
                  x={dayIndex * 24 + 3 + chainIndex * width}
                  y={negative ? 60 : 60 - size}
                  width={width}
                  height={size}
                  fill="currentColor"
                  opacity={incomplete.has(chain) ? 0.45 : 0.9}
                />
              );
            }),
          )}
        </svg>
      ) : (
        <p>No day in this window has a recorded flow.</p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="pb-2 text-left">
            Text alternative: minted, burned and net {symbol} per UTC day and chain. A chain marked incomplete is a
            floor, not a total.
          </caption>
          <thead>
            <tr>
              {["UTC day", "Chain", "Coverage", "Minted", "Burned", "Net", "Events"].map((label) => (
                <th key={label} scope="col" className="p-2">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {daily.map((row) => (
              <tr key={`${row.day}:${row.chain}`}>
                <th scope="row" className="p-2">
                  {row.day}
                </th>
                <td className="p-2">{row.chain}</td>
                <td className="p-2">{incomplete.has(row.chain) ? "Incomplete" : "Complete"}</td>
                <td className="p-2 tabular-nums">{row.mint}</td>
                <td className="p-2 tabular-nums">{row.burn}</td>
                <td className="p-2 tabular-nums">{row.net}</td>
                <td className="p-2 tabular-nums">{row.eventCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
