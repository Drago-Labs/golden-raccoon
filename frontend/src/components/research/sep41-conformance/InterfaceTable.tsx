import type { InterfaceDiffEntry } from "@/server/research/sep41-conformance";

export function InterfaceTable(props: { entries: InterfaceDiffEntry[] }) {
  if (props.entries.length === 0) {
    return <p className="text-sm text-white/55">No interface comparison available.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm" aria-label="SEP-41 interface comparison">
        <thead className="text-xs uppercase tracking-wide text-white/45">
          <tr>
            <th className="px-3 py-2 font-medium">Function</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Detail</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/10">
          {props.entries.map((entry) => (
            <tr key={`${entry.kind}-${entry.name}`}>
              <td className="px-3 py-2 font-mono text-xs">{entry.name}</td>
              <td className="px-3 py-2 capitalize">{entry.kind}</td>
              <td className="px-3 py-2 text-white/70">{entry.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
