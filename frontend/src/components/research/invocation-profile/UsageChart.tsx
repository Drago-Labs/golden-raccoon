import type { DailyPoint } from "@/server/research/invocation-profile/schema";

export function UsageChart({ daily }: { daily: DailyPoint[] }) {
  if (daily.length === 0) {
    return <p className="text-sm text-muted">No daily usage points in this window.</p>;
  }

  const max = Math.max(...daily.map((point) => point.successCount + point.failureCount), 1);

  const textAlternative = daily
    .map(
      (point) =>
        `${point.day}: ${point.successCount} success, ${point.failureCount} failure, ${point.uniqueCallers} unique callers`,
    )
    .join(". ");

  return (
    <div className="rounded-2xl border border-white/10 bg-white/4 p-4">
      <h3 className="mb-4 text-lg font-semibold">Daily usage</h3>
      <p className="sr-only">{textAlternative}</p>
      <ul className="flex flex-col gap-2" aria-hidden="true">
        {daily.map((point) => {
          const total = point.successCount + point.failureCount;
          const width = Math.max(4, Math.round((total / max) * 100));
          return (
            <li key={point.day} className="flex items-center gap-3 text-sm">
              <span className="w-28 shrink-0 font-mono text-xs text-muted">{point.day}</span>
              <span className="h-3 flex-1 overflow-hidden rounded bg-white/5">
                <span
                  className="block h-full rounded bg-[#d9a441]/70"
                  style={{ width: `${width}%` }}
                />
              </span>
              <span className="w-24 shrink-0 text-right font-mono text-xs">
                {point.successCount}/{point.failureCount}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
