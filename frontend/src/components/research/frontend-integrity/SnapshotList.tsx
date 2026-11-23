import type { ScriptRecord } from "@/server/research/frontend-integrity";
export function SnapshotList({ scripts }: { scripts: ScriptRecord[] }) {
  return (
    <table className="w-full text-sm">
      <caption className="mb-2 text-left font-medium">Scripts</caption>
      <thead><tr><th className="text-left">Source</th><th className="text-left">Hash</th><th className="text-left">Integrity</th></tr></thead>
      <tbody>
        {scripts.map((script) => (
          <tr key={script.sha256}><td>{script.src ?? "inline"}</td><td>{script.sha256.slice(0, 12)}</td><td>{script.integrity ?? "missing"}</td></tr>
        ))}
      </tbody>
    </table>
  );
}
