import type { SharePriceJump, SharePricePoint } from "@/server/research/vault-accounting";

const CHART_WIDTH = 320;
const CHART_HEIGHT = 80;

function pricedPoints(points: SharePricePoint[]) {
  return points.filter((p): p is SharePricePoint & { sharePrice: NonNullable<SharePricePoint["sharePrice"]> } => p.sharePrice !== null);
}

function buildPath(points: ReturnType<typeof pricedPoints>): string {
  if (points.length === 0) return "";
  const values = points.map((p) => BigInt(p.sharePrice.assetsPerShareScaled));
  const min = values.reduce((a, b) => (b < a ? b : a));
  const max = values.reduce((a, b) => (b > a ? b : a));
  const range = max - min;

  return points
    .map((point, index) => {
      const x = points.length === 1 ? 0 : (index / (points.length - 1)) * CHART_WIDTH;
      const value = BigInt(point.sharePrice.assetsPerShareScaled);
      const y = range === 0n ? CHART_HEIGHT / 2 : CHART_HEIGHT - Number(((value - min) * 1000n) / range) / (1000 / CHART_HEIGHT);
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

/**
 * Renders the share-price-over-blocks sample as a small line chart, with a
 * plain-text table carrying the same data for screen readers and anyone
 * who wants the exact numbers rather than a trend line.
 */
export function SharePriceChart(props: { points: SharePricePoint[]; jumps: SharePriceJump[] }) {
  const priced = pricedPoints(props.points);
  const path = buildPath(priced);

  return (
    <div className="space-y-3">
      {path ? (
        <svg
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          role="img"
          aria-label="Share price across the sampled block window"
          className="h-20 w-full max-w-xs"
        >
          <path d={path} fill="none" stroke="#d9a441" strokeWidth={2} />
        </svg>
      ) : (
        <p className="text-xs text-white/55">No price samples were available to chart.</p>
      )}

      {props.jumps.length > 0 && (
        <ul className="space-y-1 rounded-lg border border-amber-500/25 bg-amber-500/5 p-3 text-xs text-amber-200">
          {props.jumps.map((jump, index) => (
            <li key={`${jump.fromBlock}-${jump.toBlock}-${index}`}>
              Block {jump.fromBlock} → {jump.toBlock}: price moved {(jump.changeBps / 100).toFixed(2)}%
            </li>
          ))}
        </ul>
      )}

      <table className="w-full text-left text-xs">
        <caption className="sr-only">Share price samples, as a text alternative to the chart above</caption>
        <thead>
          <tr className="uppercase tracking-wide text-white/50">
            <th scope="col" className="pb-1">
              Block
            </th>
            <th scope="col" className="pb-1">
              Assets per share (scaled)
            </th>
          </tr>
        </thead>
        <tbody>
          {props.points.map((point) => (
            <tr key={point.blockNumber} className="border-t border-white/10">
              <td className="py-1">{point.blockNumber}</td>
              <td className="py-1 font-mono">{point.sharePrice?.assetsPerShareScaled ?? "unavailable"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
