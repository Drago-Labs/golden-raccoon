import type { DrawdownSummary } from "@/server/research/volatility-profile";

export function DrawdownChart(props: { drawdown: DrawdownSummary }) {
  return (
    <div className="space-y-2 rounded-lg border border-white/10 p-4 text-xs">
      <h3 className="text-sm font-medium text-white">Drawdown profile (table alternative)</h3>
      <p className="text-white/60">
        Peak: {props.drawdown.peakTimestamp ?? "n/a"} · Trough: {props.drawdown.troughTimestamp ?? "n/a"} · Recovery:{" "}
        {props.drawdown.recoveryTimestamp ?? "Unrecovered"}
      </p>
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-white/10 text-white/60">
            <th className="py-1">Timestamp</th>
            <th className="py-1">Drawdown (%)</th>
          </tr>
        </thead>
        <tbody>
          {props.drawdown.series.map((pt) => (
            <tr key={pt.timestamp} className="border-b border-white/5">
              <td className="py-1">{pt.timestamp}</td>
              <td className="py-1">{pt.drawdownPct.toFixed(2)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
