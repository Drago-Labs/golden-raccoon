"use client";

import type { ExcludedSnapshot } from "@/server/research/score-calibration/schema";

const REASON_LABELS: Record<ExcludedSnapshot["reason"], string> = {
  horizon_not_elapsed: "Horizon not yet elapsed",
  unsupported_asset_type: "Asset type not supported",
  outcome_not_configured: "Outcome not configured",
  price_data_unavailable: "Price data unavailable",
};

export function ExclusionNotice({ excludedSnapshots }: { excludedSnapshots: ExcludedSnapshot[] }) {
  if (excludedSnapshots.length === 0) return null;

  const counts = new Map<ExcludedSnapshot["reason"], number>();
  for (const excluded of excludedSnapshots) {
    counts.set(excluded.reason, (counts.get(excluded.reason) ?? 0) + 1);
  }

  return (
    <section data-testid="exclusion-notice" className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-xs text-subtle sm:p-5">
      <h2 className="text-sm font-semibold text-muted">Excluded snapshots</h2>
      <ul className="flex flex-col gap-1">
        {Array.from(counts.entries()).map(([reason, count]) => (
          <li key={reason}>
            {REASON_LABELS[reason]}: {count}
          </li>
        ))}
      </ul>
    </section>
  );
}
