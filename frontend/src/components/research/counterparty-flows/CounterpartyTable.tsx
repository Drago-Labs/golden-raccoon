import type { CounterpartyAssetTotal } from "@/server/research/counterparty-flows/schema";

export function CounterpartyTable({ totals }: { totals: CounterpartyAssetTotal[] }) {
  if (totals.length === 0) {
    return (
      <p data-testid="counterparty-table-empty" className="text-sm text-muted">
        No payment counterparties in this window.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-white/10">
      <table data-testid="counterparty-table" className="min-w-full text-left text-sm">
        <caption className="sr-only">Counterparty volumes by asset and direction</caption>
        <thead className="border-b border-white/10 bg-white/4 text-xs uppercase tracking-wide text-subtle">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">
              Direction
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Counterparty
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Label
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Asset
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Amount
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Events
            </th>
          </tr>
        </thead>
        <tbody>
          {totals.map((row) => (
            <tr key={`${row.direction}-${row.asset}-${row.counterparty}`} className="border-b border-white/5">
              <td className="px-3 py-2 capitalize">{row.direction}</td>
              <td className="px-3 py-2 font-mono text-xs">{row.counterparty}</td>
              <td className="px-3 py-2">{row.label ?? "—"}</td>
              <td className="px-3 py-2 font-mono text-xs">{row.asset}</td>
              <td className="px-3 py-2 tabular-nums">{row.amount}</td>
              <td className="px-3 py-2 tabular-nums">{row.eventCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
