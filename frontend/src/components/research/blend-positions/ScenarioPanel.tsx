import type { LiquidationScenario } from "@/server/research/blend-positions";

export function ScenarioPanel(props: { scenarios: LiquidationScenario[] }) {
  return (
    <div className="space-y-2 rounded-lg border border-white/10 p-4 text-xs">
      <h3 className="text-sm font-medium text-white">Liquidation distance scenarios</h3>
      {props.scenarios.length === 0 ? (
        <p className="text-white/60">No single-asset liquidation scenarios applicable.</p>
      ) : (
        <ul className="space-y-2">
          {props.scenarios.map((s) => (
            <li key={`${s.assetId}-${s.role}`} className="rounded border border-white/10 p-2">
              <span className="font-medium text-white">
                {s.symbol} ({s.role})
              </span>{" "}
              — {s.explanation}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
