"use client";

import { StatusBadge } from "@/components/a11y/StatusBadge";
import type { FreshnessBucket, SourceObservation } from "@/server/research/evidence-coverage/schema";

const freshnessTone = { fresh: "success", stale: "warning", unknown: "neutral" } as const;

/**
 * When each observation was made.
 *
 * The undated bucket is rendered last and labelled "unknown age" rather than
 * being dropped or placed at the present moment, so the amount of evidence that
 * could not be dated is visible.
 */
export function FreshnessTimeline({
  timeline,
  observations,
  onSelectObservation,
}: {
  timeline: FreshnessBucket[];
  observations: SourceObservation[];
  onSelectObservation?: (observationId: string) => void;
}) {
  const byId = new Map(observations.map((observation) => [observation.observationId, observation]));

  if (timeline.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-white/15 px-4 py-4 text-xs text-subtle">
        This report carries no observations to place on a timeline.
      </p>
    );
  }

  return (
    <ol className="space-y-2" data-testid="freshness-timeline">
      {timeline.map((bucket) => (
        <li key={bucket.observedAt ?? "undated"} className="rounded-lg border border-white/10 px-3 py-2 text-xs">
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={freshnessTone[bucket.freshness]}>
              {bucket.freshness === "unknown" ? "Unknown age" : bucket.freshness}
            </StatusBadge>
            <span className="font-mono">{bucket.observedAt ?? "No timestamp reported"}</span>
          </span>
          <ul className="mt-1 space-y-0.5">
            {bucket.observationIds.map((observationId) => {
              const observation = byId.get(observationId);

              return (
                <li key={observationId}>
                  <button
                    type="button"
                    onClick={() => onSelectObservation?.(observationId)}
                    className="text-left text-subtle underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-[var(--color-brand)]"
                  >
                    {observation ? `${observation.sourceLabel} · ${observation.familyLabel}` : observationId}
                  </button>
                  {observation?.ageSeconds !== null && observation?.ageSeconds !== undefined ? (
                    <span className="ml-2 text-subtle">{observation.ageSeconds}s old</span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </li>
      ))}
    </ol>
  );
}
