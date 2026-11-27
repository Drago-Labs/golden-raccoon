import type { ComparisonRow } from "@/server/research/wasm-source-meta/schema";

type ComparisonTableProps = {
  comparisons: ComparisonRow[];
};

export function ComparisonTable({ comparisons }: ComparisonTableProps) {
  return (
    <section aria-label="Source comparison" className="overflow-x-auto rounded-2xl border border-white/10">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-white/10 text-xs uppercase tracking-wide text-subtle">
          <tr>
            <th className="px-4 py-3 font-medium">Field</th>
            <th className="px-4 py-3 font-medium">Wasm</th>
            <th className="px-4 py-3 font-medium">Declared</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Reference source</th>
          </tr>
        </thead>
        <tbody>
          {comparisons.map((row, index) => (
            <tr key={`${row.field}-${index}`} className="border-b border-white/5">
              <td className="px-4 py-2 text-muted">{row.field}</td>
              <td className="px-4 py-2 font-mono text-xs">{row.wasmValue ?? "—"}</td>
              <td className="px-4 py-2 font-mono text-xs">{row.declaredValue ?? "—"}</td>
              <td className="px-4 py-2">{row.status}</td>
              <td className="px-4 py-2 text-xs text-muted">{row.referenceSource ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
