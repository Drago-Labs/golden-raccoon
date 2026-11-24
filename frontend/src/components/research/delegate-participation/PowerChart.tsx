import type { DelegateRow } from "@/server/research/delegate-participation/schema";

/**
 * Voting power over the scanned blocks. The chart is decorative: every
 * checkpoint it draws is also a row of the table below it, with the
 * transaction that produced it.
 */
export function PowerChart({ delegates }: { delegates: DelegateRow[] }) {
  const points = delegates.flatMap((delegate) => delegate.series.map((point) => ({ delegate: delegate.address, ...point })));
  const blocks = points.map((point) => point.blockNumber);
  const minBlock = Math.min(...blocks, 0);
  const maxBlock = Math.max(...blocks, minBlock + 1);
  const scale = points.reduce((largest, point) => {
    const value = BigInt(point.powerUnits);
    return value > largest ? value : largest;
  }, 1n);

  return (
    <section className="space-y-3" aria-label="Voting power over time">
      <h2 className="text-lg font-semibold">Voting power over time</h2>
      {points.length ? (
        <svg viewBox="0 0 640 160" role="img" aria-labelledby="power-chart-title" className="max-h-64 w-full">
          <title id="power-chart-title">
            Each delegate&apos;s voting power at every checkpoint in the scanned block range. The table below this chart
            carries every checkpoint, its block and its transaction.
          </title>
          <line x1="20" x2="620" y1="140" y2="140" stroke="currentColor" strokeWidth="0.5" />
          {delegates.map((delegate, index) => (
            <polyline
              key={delegate.address}
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              opacity={1 - index * 0.15}
              points={delegate.series
                .map((point) => {
                  const x = 20 + ((point.blockNumber - minBlock) / Math.max(maxBlock - minBlock, 1)) * 600;
                  const height = Number((BigInt(point.powerUnits) * 120n) / scale);
                  return `${x},${140 - height}`;
                })
                .join(" ")}
            />
          ))}
        </svg>
      ) : (
        <p>No delegation checkpoint was recorded in the scanned range.</p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="pb-2 text-left">
            Text alternative: every voting-power checkpoint in the scanned range
          </caption>
          <thead>
            <tr>
              {["Block", "Delegate", "Power after", "Change", "Transaction"].map((label) => (
                <th key={label} scope="col" className="p-2">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {points
              .sort((left, right) => left.blockNumber - right.blockNumber || left.delegate.localeCompare(right.delegate))
              .map((point) => (
                <tr key={`${point.delegate}:${point.blockNumber}:${point.txId}`}>
                  <th scope="row" className="p-2 tabular-nums">
                    {point.blockNumber}
                  </th>
                  <td className="max-w-56 break-all p-2">{point.delegate}</td>
                  <td className="p-2 tabular-nums">{point.powerUnits}</td>
                  <td className="p-2 tabular-nums">{point.deltaUnits}</td>
                  <td className="max-w-64 break-all p-2">
                    <a href={point.txUrl} target="_blank" rel="noreferrer noopener" className="underline">
                      {point.txId}
                    </a>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
