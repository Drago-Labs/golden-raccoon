import type { ResourceHeadroomItem } from "@/server/research/resource-headroom";

export function ResourceGaugeList(props: { resources: ResourceHeadroomItem[] }) {
  if (props.resources.length === 0) return null;
  return (
    <div className="space-y-3 rounded-lg border border-white/10 p-4 text-xs">
      <h3 className="text-sm font-medium text-white">Resource utilization gauges</h3>
      <ul className="space-y-2">
        {props.resources.map((r) => (
          <li key={r.key} className="space-y-1">
            <div className="flex justify-between">
              <span className="font-medium text-white">{r.label}</span>
              <span className="font-mono text-white/80">
                {r.fractionDisplay} ({r.utilizationPct.toFixed(2)}% used, {r.headroomPct.toFixed(2)}% headroom)
              </span>
            </div>
            <div
              role="meter"
              aria-label={r.label}
              aria-valuenow={r.utilizationPct}
              aria-valuemin={0}
              aria-valuemax={100}
              className="h-2 w-full overflow-hidden rounded bg-white/10"
            >
              <div
                style={{ width: `${Math.min(100, r.utilizationPct)}%` }}
                className={r.flagged ? "h-full bg-amber-400" : "h-full bg-emerald-400"}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
