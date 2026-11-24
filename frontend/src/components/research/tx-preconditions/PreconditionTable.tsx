import type { PreconditionRow } from "@/server/research/tx-preconditions/schema";

export function PreconditionTable({ rows }: { rows: PreconditionRow[] }) {
  return (
    <section data-testid="precondition-table" className="rounded-2xl border border-white/10 bg-white/4 p-4">
      <h2 className="text-lg font-semibold">Preconditions</h2>
      <div className="mt-3 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="text-muted">
            <tr>
              <th className="py-2 pr-4 font-medium">Name</th>
              <th className="py-2 pr-4 font-medium">Value</th>
              <th className="py-2 pr-4 font-medium">Status</th>
              <th className="py-2 font-medium">Explanation</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.name} className="border-t border-white/8 align-top">
                <td className="py-2 pr-4 font-mono text-xs">{row.name}</td>
                <td className="py-2 pr-4 font-mono text-xs">{row.value ?? "—"}</td>
                <td className="py-2 pr-4">{row.status}</td>
                <td className="py-2 text-muted">{row.explanation}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
