/**
 * Participation by author.
 *
 * The invariant: one account posting ten times is **one participant**. Repeated
 * observations raise an author's message count, never the distinct-author
 * count, which is what stops a single noisy account from looking like a crowd.
 *
 * Author keys are opaque strings the caller supplied. Nothing here resolves one
 * to a person, a follower graph or any other identity.
 */
import type { MessageCluster, ObservationRef, ParticipationRow } from "./schema";

export function buildParticipation(
  observations: ObservationRef[],
  clusters: MessageCluster[],
): ParticipationRow[] {
  const total = observations.length;
  const byAuthor = new Map<string, ObservationRef[]>();

  for (const observation of observations) {
    const bucket = byAuthor.get(observation.authorKey);
    if (bucket) bucket.push(observation);
    else byAuthor.set(observation.authorKey, [observation]);
  }

  const clustersByObservation = new Map<string, string[]>();

  for (const cluster of clusters) {
    for (const observationId of cluster.observationIds) {
      const bucket = clustersByObservation.get(observationId);
      if (bucket) bucket.push(cluster.clusterId);
      else clustersByObservation.set(observationId, [cluster.clusterId]);
    }
  }

  return [...byAuthor.entries()]
    .map(([authorKey, entries]) => {
      const times = entries
        .map((entry) => (entry.postedAt ? Date.parse(entry.postedAt) : Number.NaN))
        .filter(Number.isFinite)
        .sort((left, right) => left - right);

      const clusterIds = new Set(
        entries.flatMap((entry) => clustersByObservation.get(entry.observationId) ?? []),
      );

      return {
        authorKey,
        observationCount: entries.length,
        distinctClusterCount: clusterIds.size,
        share: total === 0 ? 0 : Number((entries.length / total).toFixed(6)),
        firstPostedAt: times.length > 0 ? new Date(times[0]).toISOString() : null,
        lastPostedAt: times.length > 0 ? new Date(times[times.length - 1]).toISOString() : null,
      };
    })
    .sort((left, right) => {
      const byCount = right.observationCount - left.observationCount;
      return byCount !== 0 ? byCount : left.authorKey.localeCompare(right.authorKey);
    });
}

/** Distinct participants, counted once each however often they posted. */
export function distinctAuthorCount(observations: ObservationRef[]): number {
  return new Set(observations.map((observation) => observation.authorKey)).size;
}
