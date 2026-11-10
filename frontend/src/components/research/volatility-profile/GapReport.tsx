import type { DetectedGap } from "@/server/research/volatility-profile";

export function GapReport(props: { gaps: DetectedGap[] }) {
  return (
    <div className="space-y-2 rounded-lg border border-white/10 p-4 text-xs">
      <h3 className="text-sm font-medium text-white">Detected data gaps</h3>
      {props.gaps.length === 0 ? (
        <p className="text-white/60">No gaps exceeded the interval threshold.</p>
      ) : (
        <ul className="space-y-1">
          {props.gaps.map((gap) => (
            <li key={`${gap.fromTimestamp}-${gap.toTimestamp}`}>
              {gap.fromTimestamp} → {gap.toTimestamp} ({gap.elapsedSeconds}s elapsed, expected {gap.expectedSeconds}s)
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
