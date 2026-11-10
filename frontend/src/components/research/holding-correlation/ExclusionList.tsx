import type { ExcludedHolding } from "@/server/research/holding-correlation";

export function ExclusionList(props: { exclusions: ExcludedHolding[] }) {
  if (props.exclusions.length === 0) return null;
  return (
    <div className="space-y-2 rounded-lg border border-white/10 p-4 text-xs">
      <h3 className="text-sm font-medium text-white">Excluded holdings</h3>
      <ul className="space-y-1">
        {props.exclusions.map((item) => (
          <li key={item.assetId}>
            {item.symbol} ({item.assetId}) — {item.reason} ({item.availablePoints}/{item.requiredPoints} points)
          </li>
        ))}
      </ul>
    </div>
  );
}
