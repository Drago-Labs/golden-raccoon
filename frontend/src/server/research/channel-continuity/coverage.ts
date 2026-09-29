/**
 * Continuity timeline and source coverage.
 *
 * Undated observations get their own bucket rather than being placed at "now".
 * Coverage reports who supplied evidence and how much failed — it never invents
 * a missing archive or a successful fetch.
 */
import type {
  ChannelObservation,
  ContinuityCoverage,
  ContinuityEvent,
  SourceCoverageRow,
  TimelineEntry,
} from "./schema";

export function buildTimeline(
  observations: ChannelObservation[],
  events: ContinuityEvent[],
): TimelineEntry[] {
  const buckets = new Map<string, TimelineEntry>();

  for (const observation of observations) {
    const key = observation.observedAt ?? "undated";
    const entry = buckets.get(key) ?? {
      observedAt: observation.observedAt,
      observationIds: [],
      eventIds: [],
      note: observation.observedAt
        ? "Observations and events recorded at this timestamp."
        : "Undated observations — placed nowhere rather than assumed to be current.",
    };
    entry.observationIds.push(observation.observationId);
    buckets.set(key, entry);
  }

  for (const event of events) {
    const key = event.observedAt ?? "undated";
    const entry = buckets.get(key) ?? {
      observedAt: event.observedAt,
      observationIds: [],
      eventIds: [],
      note: event.observedAt
        ? "Observations and events recorded at this timestamp."
        : "Undated observations — placed nowhere rather than assumed to be current.",
    };
    entry.eventIds.push(event.eventId);
    buckets.set(key, entry);
  }

  return [...buckets.entries()]
    .sort(([left], [right]) => {
      if (left === "undated") return 1;
      if (right === "undated") return -1;
      return left.localeCompare(right);
    })
    .map(([, entry]) => entry);
}

export function buildSourceCoverage(observations: ChannelObservation[]): SourceCoverageRow[] {
  const rows = new Map<string, SourceCoverageRow>();

  for (const observation of observations) {
    const row = rows.get(observation.sourceLabel) ?? {
      sourceLabel: observation.sourceLabel,
      observationCount: 0,
      subjectCount: 0,
      failedCount: 0,
      missingArchiveCount: 0,
      blockedUnsafeCount: 0,
      canonicalReferenceCount: 0,
      userSuppliedCount: 0,
      ambiguousCount: 0,
    };

    row.observationCount += 1;
    if (observation.fetchOutcome === "source_failed") row.failedCount += 1;
    if (observation.fetchOutcome === "missing_archive") row.missingArchiveCount += 1;
    if (observation.fetchOutcome === "blocked_unsafe") row.blockedUnsafeCount += 1;
    if (observation.claimKind === "canonical_reference") row.canonicalReferenceCount += 1;
    if (observation.claimKind === "user_supplied") row.userSuppliedCount += 1;
    if (observation.claimKind === "ambiguous") row.ambiguousCount += 1;

    rows.set(observation.sourceLabel, row);
  }

  for (const row of rows.values()) {
    const subjects = new Set(
      observations.filter((observation) => observation.sourceLabel === row.sourceLabel).map((observation) => observation.subjectId),
    );
    row.subjectCount = subjects.size;
  }

  return [...rows.values()].sort((left, right) => right.observationCount - left.observationCount || left.sourceLabel.localeCompare(right.sourceLabel));
}

export function buildCoverage(
  subjects: { subjectId: string }[],
  observations: ChannelObservation[],
  analysableCount: number,
  events: ContinuityEvent[],
): ContinuityCoverage {
  const undatedCount = observations.filter((observation) => observation.observedAt === null).length;
  const blockedUnsafeCount = observations.filter((observation) => observation.fetchOutcome === "blocked_unsafe").length;

  if (subjects.length === 0 && observations.length === 0) {
    return {
      state: "empty",
      subjectCount: 0,
      observationCount: 0,
      analysableCount: 0,
      eventCount: 0,
      undatedCount: 0,
      blockedUnsafeCount: 0,
      note: "No subjects or channel observations were supplied, so there is nothing to inspect.",
    };
  }

  if (analysableCount === 0) {
    return {
      state: "insufficient",
      subjectCount: subjects.length,
      observationCount: observations.length,
      analysableCount: 0,
      eventCount: events.length,
      undatedCount,
      blockedUnsafeCount,
      note: "No observation could take part in a continuity diff. Failures, missing archives and blocked URLs are listed as coverage gaps, not as channel conclusions.",
    };
  }

  const gapReasons: string[] = [];
  if (undatedCount > 0) gapReasons.push(`${undatedCount} undated`);
  if (blockedUnsafeCount > 0) gapReasons.push(`${blockedUnsafeCount} blocked as unsafe`);
  if (observations.length > analysableCount) {
    gapReasons.push(`${observations.length - analysableCount} excluded from diffs`);
  }

  return {
    state: gapReasons.length === 0 ? "complete" : "partial",
    subjectCount: subjects.length,
    observationCount: observations.length,
    analysableCount,
    eventCount: events.length,
    undatedCount,
    blockedUnsafeCount,
    note:
      gapReasons.length === 0
        ? `All ${analysableCount} analysable observations across ${subjects.length} subject${subjects.length === 1 ? "" : "s"} carry enough data for continuity comparison.`
        : `Read this report as partial: ${gapReasons.join("; ")}. Uncertainty is preserved rather than resolved by guessing.`,
  };
}
