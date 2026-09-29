"use client";

import { StatusBadge } from "@/components/a11y/StatusBadge";
import type { Contradiction, SourceObservation } from "@/server/research/evidence-coverage/schema";

const reasonLabel = {
  comparable: "Comparable",
  different_identity: "Different asset",
  different_unit: "Different unit",
  disjoint_windows: "Different window",
  unstructured_value: "Not structured",
  missing_timestamp: "Cannot be placed in time",
} as const;

/**
 * Contradictions and, just as importantly, the comparisons that were rejected.
 *
 * Showing the rejected pairs is what lets a reader see that the feature looked
 * and declined, rather than wondering whether it looked at all.
 */
export function ConflictInspector({
  contradictions,
  incomparablePairs,
  observations,
}: {
  contradictions: Contradiction[];
  incomparablePairs: Contradiction[];
  observations: SourceObservation[];
}) {
  const byId = new Map(observations.map((observation) => [observation.observationId, observation]));

  function describe(observationId: string): string {
    const observation = byId.get(observationId);
    if (!observation) return observationId;

    const value =
      observation.value === null
        ? "no value"
        : observation.value.kind === "number"
          ? `${observation.value.amount} ${observation.value.unit}`
          : "free text";

    return `${observation.sourceLabel} (${observation.familyLabel}) — ${value}`;
  }

  return (
    <section aria-labelledby="evidence-conflicts-heading" className="space-y-4">
      <h3 id="evidence-conflicts-heading" className="text-sm font-semibold">
        Conflicts
      </h3>

      {contradictions.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/15 px-4 py-4 text-xs text-subtle">
          No provable conflict was found. A conflict requires two structured values in the same unit, about the same
          asset, over overlapping windows.
        </p>
      ) : (
        <ul className="space-y-2" data-testid="contradictions">
          {contradictions.map((conflict) => (
            <li
              key={`${conflict.leftObservationId}-${conflict.rightObservationId}`}
              className="rounded-lg border border-red-300/35 bg-red-400/8 px-3 py-2 text-xs"
            >
              <span className="flex flex-wrap items-center gap-2">
                <StatusBadge tone="danger">Contradiction</StatusBadge>
                <span className="font-medium">{conflict.difference}</span>
              </span>
              <span className="mt-1 block text-subtle">{describe(conflict.leftObservationId)}</span>
              <span className="block text-subtle">{describe(conflict.rightObservationId)}</span>
              <span className="mt-1 block text-subtle">{conflict.detail}</span>
            </li>
          ))}
        </ul>
      )}

      {incomparablePairs.length > 0 ? (
        <div data-testid="incomparable-pairs">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-subtle">
            Comparisons declined ({incomparablePairs.length})
          </h4>
          <p className="mt-1 text-xs text-subtle">
            These pairs differ, but not in a way that proves disagreement. They are not counted as conflicts, and they do
            not count as agreement either.
          </p>
          <ul className="mt-2 space-y-2">
            {incomparablePairs.map((pair) => (
              <li
                key={`${pair.leftObservationId}-${pair.rightObservationId}`}
                className="rounded-lg border border-white/10 px-3 py-2 text-xs"
              >
                <StatusBadge tone="warning">{reasonLabel[pair.reason]}</StatusBadge>
                <span className="mt-1 block text-subtle">{describe(pair.leftObservationId)}</span>
                <span className="block text-subtle">{describe(pair.rightObservationId)}</span>
                <span className="mt-1 block text-subtle">{pair.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
