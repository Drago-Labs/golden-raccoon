import type { PoolHistoryReport } from "@/server/research/soroban-pool-history/schema";

export function ReserveChart({ report }: { report: PoolHistoryReport }) {
  const points = report.reserves;
  const textAlt = points.length
    ? points
        .map((point) => `ledger ${point.ledger}: A=${point.reserveA} B=${point.reserveB} price=${point.price}`)
        .join("; ")
    : "No reserve points in this window.";

  return (
    <section data-testid="reserve-chart" className="rounded-2xl border border-white/10 bg-white/4 p-4 text-sm">
      <h2 className="text-lg font-semibold">Reserve chart</h2>
      <p className="mt-1 text-muted">Rebuilt reserve A and implied price across the selected ledger range.</p>
      <svg viewBox="0 0 320 120" role="img" aria-label={`Pool reserves: ${textAlt}`} className="mt-3 h-32 w-full">
        <title>Pool reserves</title>
        <desc>{textAlt}</desc>
        {points.length > 1
          ? (() => {
              const values = points.map((point) => Number(BigInt(point.reserveA)));
              const min = Math.min(...values);
              const max = Math.max(...values);
              const span = Math.max(max - min, 1);
              const coords = points
                .map((point, index) => {
                  const x = (index / (points.length - 1)) * 300 + 10;
                  const y = 100 - ((Number(BigInt(point.reserveA)) - min) / span) * 80;
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
          <li key={`${point.ledger}-${point.eventId ?? "open"}`}>
            Ledger {point.ledger}: A={point.reserveA}, B={point.reserveB}, price={point.price}
          </li>
        ))}
      </ol>
    </section>
  );
}
