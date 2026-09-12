/**
 * Freshness timeline.
 *
 * Observations with no timestamp are kept in their own bucket rather than
 * dropped or placed at "now", so the timeline shows how much of the evidence
 * could not be dated at all.
 */
import type { FreshnessBucket, SourceObservation } from "./schema";

export function buildTimeline(observations: SourceObservation[]): FreshnessBucket[] {
  const dated = new Map<string, string[]>();
  const undated: string[] = [];

  for (const observation of observations) {
    if (!observation.observedAt || observation.freshness === "unknown") {
      undated.push(observation.observationId);
      continue;
    }

    const bucket = dated.get(observation.observedAt);
    if (bucket) bucket.push(observation.observationId);
    else dated.set(observation.observedAt, [observation.observationId]);
  }

  const buckets: FreshnessBucket[] = [...dated.entries()]
    .sort(([left], [right]) => Date.parse(left) - Date.parse(right))
    .map(([observedAt, observationIds]) => ({
      observedAt,
      observationIds: observationIds.sort(),
      freshness: observations.find((observation) => observation.observationId === observationIds[0])?.freshness ?? "unknown",
    }));

  if (undated.length > 0) {
    buckets.push({ observedAt: null, observationIds: undated.sort(), freshness: "unknown" });
  }

  return buckets;
}
