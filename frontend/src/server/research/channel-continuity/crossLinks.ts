/**
 * Cross-link graph built from supplied observation snapshots.
 *
 * Edges are evidence that a page pointed at another URL at a point in time.
 * Lookalike or unsafe targets stay as separate, possibly blocked edges — they
 * are never treated as the same channel or as proof of ownership.
 */
import { hostnameOf, summarizeUrlSafety } from "./urlPolicy";
import type { ChannelObservation, CrossLinkEdge } from "./schema";

export function buildCrossLinkGraph(observations: ChannelObservation[]): CrossLinkEdge[] {
  const edges = new Map<string, CrossLinkEdge>();

  for (const observation of observations) {
    if (!observation.url && observation.crossLinks.length === 0) continue;

    for (const target of observation.crossLinks) {
      const safety = summarizeUrlSafety(target);
      const edgeKey = `${observation.identityKey}|${observation.url ?? observation.channelKey}|${target}`;
      const existing = edges.get(edgeKey);

      if (existing) {
        existing.observationCount += 1;
        existing.lastSeenAt = observation.observedAt ?? existing.lastSeenAt;
        if (observation.observedAt && (!existing.firstSeenAt || observation.observedAt < existing.firstSeenAt)) {
          existing.firstSeenAt = observation.observedAt;
        }
        continue;
      }

      edges.set(edgeKey, {
        edgeId: `edge:${edges.size}:${observation.observationId}`,
        subjectId: observation.subjectId,
        identityKey: observation.identityKey,
        fromObservationId: observation.observationId,
        fromUrl: observation.url,
        toUrl: target,
        toHostname: hostnameOf(target) ?? safety.hostname,
        blocked: !safety.safe,
        firstSeenAt: observation.observedAt,
        lastSeenAt: observation.observedAt,
        observationCount: 1,
      });
    }
  }

  return [...edges.values()].sort((left, right) => left.edgeId.localeCompare(right.edgeId));
}
