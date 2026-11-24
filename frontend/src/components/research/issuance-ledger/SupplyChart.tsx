import { stroopsToDecimal } from "@/server/research/issuance-ledger/decimalMath";
import type { IssuanceReport } from "@/server/research/issuance-ledger/schema";

export function SupplyChart({ report }: { report: IssuanceReport }) {
  const points = report.supplySeries;
  const textAlt = points.length
    ? points.map((point) => `ledger ${point.ledger}: ${stroopsToDecimal(BigInt(point.supplyStroops))}`).join("; ")
    : "No supply points in this window.";

  return (
    <section data-testid="supply-chart" className="rounded-2xl border border-white/10 bg-white/4 p-4 text-sm">
      <h2 className="text-lg font-semibold">Supply chart</h2>
      <p className="mt-1 text-muted">Running outstanding supply after each classified operation.</p>
      <svg viewBox="0 0 320 120" role="img" aria-label={`Running supply: ${textAlt}`} className="mt-3 h-32 w-full">
        <title>Running supply</title>
        <desc>{textAlt}</desc>
        {points.length > 1
          ? (() => {
              const values = points.map((point) => Number(BigInt(point.supplyStroops)));
              const min = Math.min(...values);
              const max = Math.max(...values);
              const span = Math.max(max - min, 1);
              const coords = points
                .map((point, index) => {
                  const x = (index / (points.length - 1)) * 300 + 10;
                  const y = 100 - ((Number(BigInt(point.supplyStroops)) - min) / span) * 80;
                  return `${x},${y}`;
                })
                .join(" ");
              return <polyline fill="none" stroke="#d9a441" strokeWidth="2" points={coords} />;
            })()
          : null}
      </svg>
      <p className="sr-only">{textAlt}</p>
      <ol className="mt-2 flex flex-col gap-1">
        {points.map((point) => (
          <li key={`${point.ledger}-${point.supplyStroops}`}>
            Ledger {point.ledger}: {stroopsToDecimal(BigInt(point.supplyStroops))}
          </li>
        ))}
      </ol>
    </section>
  );
}
