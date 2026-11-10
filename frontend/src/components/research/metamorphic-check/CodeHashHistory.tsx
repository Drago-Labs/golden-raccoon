import type { CodeHashComparison } from "@/server/research/metamorphic-check";

export function CodeHashHistory(props: { history: CodeHashComparison }) {
  return (
    <div className="space-y-2 rounded-lg border border-white/10 p-4 text-xs">
      <h3 className="text-sm font-medium text-white">Code-hash history</h3>
      <div>Historical change detected: {props.history.historicalCodeChangeDetected ? "Yes" : "No"}</div>
      <ul className="space-y-1">
        {props.history.samples.map((s) => (
          <li key={s.blockNumber}>
            Block {s.blockNumber}: {s.codeHash ?? "empty"}
          </li>
        ))}
      </ul>
    </div>
  );
}
