/**
 * Detects channel continuity events between ordered observations.
 *
 * Every event is evidence of a change, never proof of takeover or fraud. The
 * limitation text travels with the event so UI and API consumers cannot omit it.
 */
import { domainsAreDistinct, hostnameOf } from "./urlPolicy";
import type { ChannelObservation, ContinuityEvent, ContinuityEventKind } from "./schema";

const LIMITATION =
  "A link or handle change is evidence of what was observed, not proof of takeover, impersonation, or fraud.";

function seriesKey(observation: ChannelObservation): string {
  return `${observation.identityKey}|${observation.channelKind}|${observation.channelKey}`;
}

function sortKey(observation: ChannelObservation): string {
  return `${observation.observedAt ?? "9999"}|${observation.observationId}`;
}

function pushEvent(
  events: ContinuityEvent[],
  kind: ContinuityEventKind,
  from: ChannelObservation | null,
  to: ChannelObservation,
  detail: string,
): void {
  events.push({
    eventId: `${kind}:${to.observationId}:${events.length}`,
    kind,
    subjectId: to.subjectId,
    identityKey: to.identityKey,
    channelKind: to.channelKind,
    channelKey: to.channelKey,
    observedAt: to.observedAt,
    fromObservationId: from?.observationId ?? null,
    toObservationId: to.observationId,
    detail,
    limitation: LIMITATION,
  });
}

function crossLinkSignature(links: string[]): string {
  return [...links].map((link) => link.toLowerCase()).sort().join("|");
}

/**
 * Build continuity events. Observations for different identity keys never
 * compare, so same-symbol tokens and lookalike domains stay separate.
 */
export function buildContinuityEvents(observations: ChannelObservation[]): ContinuityEvent[] {
  const events: ContinuityEvent[] = [];
  const grouped = new Map<string, ChannelObservation[]>();

  for (const observation of observations) {
    const key = seriesKey(observation);
    const bucket = grouped.get(key) ?? [];
    bucket.push(observation);
    grouped.set(key, bucket);
  }

  for (const series of grouped.values()) {
    const ordered = [...series].sort((left, right) => sortKey(left).localeCompare(sortKey(right)));

    for (let index = 0; index < ordered.length; index += 1) {
      const current = ordered[index];
      const previous = index > 0 ? ordered[index - 1] : null;

      if (current.fetchOutcome === "redirected" || current.redirectChain.length > 1) {
        const hops = current.redirectChain.length > 0 ? current.redirectChain.join(" → ") : current.url ?? "(unknown)";
        pushEvent(
          events,
          "redirect",
          previous,
          current,
          `Redirect chain observed for ${current.channelKind} (${current.channelKey}): ${hops}.`,
        );
      }

      if (current.fetchOutcome === "broken") {
        pushEvent(
          events,
          "broken_link",
          previous,
          current,
          `The ${current.channelKind} link ${current.url ?? current.handle ?? "(undeclared)"} was observed broken.`,
        );
      }

      if (current.fetchOutcome === "source_failed") {
        pushEvent(
          events,
          "source_failure",
          previous,
          current,
          `Source "${current.sourceLabel}" failed while collecting ${current.channelKind} evidence.`,
        );
      }

      if (current.fetchOutcome === "missing_archive") {
        pushEvent(
          events,
          "missing_archive",
          previous,
          current,
          `No archive was available for ${current.channelKind} (${current.channelKey}) at this observation.`,
        );
      }

      if (current.fetchOutcome === "blocked_unsafe") {
        pushEvent(
          events,
          "blocked_unsafe",
          previous,
          current,
          `Unsafe or private-network URL blocked for ${current.channelKind}: ${current.url ?? "(undeclared)"}.`,
        );
      }

      // Pairwise field diffs only run between analysable observations so a
      // missing archive or source failure cannot invent a domain/handle change.
      if (!previous || previous.excludedReason !== null || current.excludedReason !== null) continue;

      const previousHost = hostnameOf(previous.url);
      const currentHost = hostnameOf(current.url);
      if (previousHost && currentHost && domainsAreDistinct(previousHost, currentHost)) {
        pushEvent(
          events,
          "domain_change",
          previous,
          current,
          `Domain changed from ${previousHost} to ${currentHost} for ${current.channelKind}.`,
        );
      }

      if (previous.handle && current.handle && previous.handle !== current.handle) {
        pushEvent(
          events,
          "handle_change",
          previous,
          current,
          `Handle changed from @${previous.handle} to @${current.handle} for ${current.channelKind}.`,
        );
      }

      if (previous.displayName && current.displayName && previous.displayName !== current.displayName) {
        pushEvent(
          events,
          "display_name_change",
          previous,
          current,
          `Display name changed from "${previous.displayName}" to "${current.displayName}" for ${current.channelKind}.`,
        );
      }

      if (
        (previous.crossLinks.length > 0 || current.crossLinks.length > 0) &&
        crossLinkSignature(previous.crossLinks) !== crossLinkSignature(current.crossLinks)
      ) {
        pushEvent(
          events,
          "cross_link_change",
          previous,
          current,
          `Cross-links on ${current.channelKind} changed (${previous.crossLinks.length} → ${current.crossLinks.length}).`,
        );
      }
    }
  }

  return events.sort((left, right) => {
    const time = (left.observedAt ?? "9999").localeCompare(right.observedAt ?? "9999");
    return time !== 0 ? time : left.eventId.localeCompare(right.eventId);
  });
}
