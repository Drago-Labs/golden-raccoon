import type { ResourceHeadroomItem } from "@/server/research/resource-headroom";

export function LimitTable(props: { resources: ResourceHeadroomItem[]; limitsLedger: number | null }) {
  if (props.resources.length === 0) return null;
  return (
    <div className="space-y-2 rounded-lg border border-white/10 p-4 text-xs">
      <h3 className="text-sm font-medium text-white">
        Per-transaction network limits (ledger {props.limitsLedger ?? "N/A"})
      </h3>
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-white/10 text-white/60">
            <th className="py-1">Resource</th>
            <th className="py-1">Used</th>
            <th className="py-1">Network limit</th>
            <th className="py-1">Remaining headroom</th>
          </tr>
        </thead>
        <tbody>
          {props.resources.map((r) => (
            <tr key={r.key} className="border-b border-white/5">
              <td className="py-1 font-medium text-white">{r.label}</td>
              <td className="py-1 font-mono">{r.used}</td>
              <td className="py-1 font-mono">{r.limit}</td>
              <td className="py-1 font-mono">
                {r.headroomRemaining} ({r.headroomPct.toFixed(2)}%)
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
