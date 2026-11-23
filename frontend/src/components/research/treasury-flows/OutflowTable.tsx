import type { TreasuryReport } from "@/server/research/treasury-flows";
export function OutflowTable({ outflows }: { outflows: TreasuryReport["outflows"] }) {
  return (
    <table className="w-full text-sm">
      <caption className="mb-2 text-left font-medium">Outflows</caption>
      <thead><tr><th className="text-left">Destination</th><th className="text-left">Kind</th><th className="text-left">Amount</th></tr></thead>
      <tbody>{outflows.map((row) => <tr key={`${row.time}:${row.destination}`}><td>{row.destination}</td><td>{row.kind}</td><td>{row.amount} {row.asset}</td></tr>)}</tbody>
    </table>
  );
}
