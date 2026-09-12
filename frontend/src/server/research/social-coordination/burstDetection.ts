/**
 * Repeated-text clustering.
 *
 * Clusters group observations whose normalized text matches, either exactly or
 * above the published similarity threshold. Grouping is by content only — an
 * author's identity never joins or splits a cluster.
 *
 * Ordering cannot change the outcome: observations are sorted by a stable key
 * before clustering, and each cluster's members are sorted afterwards.
 */
import { normalizeForComparison, tokenize } from "./observationAdapter";
import { similarity } from "./textSimilarity";
import { COORDINATION_THRESHOLDS, type MessageCluster, type ObservationRef } from "./schema";

export function buildClusters(observations: ObservationRef[]): MessageCluster[] {
  const ordered = [...observations].sort((left, right) => left.observationId.localeCompare(right.observationId));

  const normalized = new Map(
    ordered.map((observation) => [observation.observationId, tokenize(normalizeForComparison(observation.text))]),
  );

  const assigned = new Map<string, number>();
  const groups: Array<{ members: ObservationRef[]; exact: boolean }> = [];

  for (const observation of ordered) {
    if (assigned.has(observation.observationId)) continue;

    const tokens = normalized.get(observation.observationId) ?? [];
    const group: ObservationRef[] = [observation];
    let exact = true;

    assigned.set(observation.observationId, groups.length);

    for (const candidate of ordered) {
      if (assigned.has(candidate.observationId)) continue;

      if (candidate.normalizedTextHash === observation.normalizedTextHash) {
        assigned.set(candidate.observationId, groups.length);
        group.push(candidate);
        continue;
      }

      const score = similarity(tokens, normalized.get(candidate.observationId) ?? []);

      if (score >= COORDINATION_THRESHOLDS.repeatSimilarity) {
        assigned.set(candidate.observationId, groups.length);
        group.push(candidate);
        exact = false;
      }
    }

    groups.push({ members: group, exact });
  }

  return groups
    .filter((group) => group.members.length >= COORDINATION_THRESHOLDS.minClusterSize)
    .map((group) => {
      const members = [...group.members].sort((left, right) => left.observationId.localeCompare(right.observationId));
      const times = members
        .map((member) => (member.postedAt ? Date.parse(member.postedAt) : Number.NaN))
        .filter(Number.isFinite)
        .sort((left, right) => left - right);

      const distinctAuthors = new Set(members.map((member) => member.authorKey)).size;
      const spanSeconds = times.length >= 2 ? Math.floor((times[times.length - 1] - times[0]) / 1_000) : null;

      return {
        clusterId: `cluster:${members[0].normalizedTextHash}`,
        sampleText: members[0].text,
        observationIds: members.map((member) => member.observationId),
        distinctAuthorCount: distinctAuthors,
        earliestPostedAt: times.length > 0 ? new Date(times[0]).toISOString() : null,
        latestPostedAt: times.length > 0 ? new Date(times[times.length - 1]).toISOString() : null,
        spanSeconds,
        matchKind: group.exact ? ("identical_text" as const) : ("near_identical_text" as const),
        note: `${members.length} observations from ${distinctAuthors} distinct author${distinctAuthors === 1 ? "" : "s"} share this text${
          spanSeconds !== null ? ` within ${spanSeconds} seconds` : ""
        }. This is a measurement of repetition, not a statement about why it happened.`,
      };
    })
    .sort((left, right) => {
      const bySize = right.observationIds.length - left.observationIds.length;
      return bySize !== 0 ? bySize : left.clusterId.localeCompare(right.clusterId);
    });
}
