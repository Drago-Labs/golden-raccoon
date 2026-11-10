import type { ResourceHeadroomItem } from "@/server/research/resource-headroom";

export function HeadroomWarnings(props: {
  simulationFailed: boolean;
  failureMessage: string | null;
  diagnosticEvents: string[];
  flaggedResources: ResourceHeadroomItem[];
}) {
  const { simulationFailed, failureMessage, diagnosticEvents, flaggedResources } = props;
  if (!simulationFailed && flaggedResources.length === 0) return null;

  return (
    <div data-testid="headroom-warnings" className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-200">
      <h3 className="text-sm font-medium text-white">Headroom & Simulation Diagnostics</h3>
      {simulationFailed && (
        <div className="space-y-1">
          <p className="font-semibold text-red-200">Simulation failed: {failureMessage}</p>
          {diagnosticEvents.length > 0 && (
            <ul className="list-disc pl-4 font-mono">
              {diagnosticEvents.map((ev) => (
                <li key={ev}>{ev}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {flaggedResources.length > 0 && (
        <ul className="space-y-1">
          {flaggedResources.map((r) => (
            <li key={r.key}>
              Warning: <span className="font-semibold">{r.label}</span> used {r.utilizationPct.toFixed(2)}% ({r.fractionDisplay})
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
