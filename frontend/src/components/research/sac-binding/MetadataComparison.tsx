import type { MetadataComparisonResult } from "@/server/research/sac-binding";

export function MetadataComparison(props: { comparison: MetadataComparisonResult | null }) {
  if (!props.comparison) return null;
  return (
    <div className="space-y-2 rounded-lg border border-white/10 p-4 text-xs">
      <h3 className="text-sm font-medium text-white">Token metadata comparison</h3>
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-white/10 text-white/60">
            <th className="py-1">Field</th>
            <th className="py-1">Expected classic value</th>
            <th className="py-1">Reported contract value</th>
            <th className="py-1">Match</th>
          </tr>
        </thead>
        <tbody>
          {props.comparison.fields.map((f) => (
            <tr key={f.field} className="border-b border-white/5">
              <td className="py-1 font-medium text-white">{f.field}</td>
              <td className="py-1 font-mono">{f.expected}</td>
              <td className="py-1 font-mono">{f.reported ?? "Unavailable"}</td>
              <td className="py-1">{f.matches ? "Match" : "Mismatch"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
