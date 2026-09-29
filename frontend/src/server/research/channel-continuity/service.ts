/**
 * Public entry point for channel-continuity inspection.
 *
 * `inspectChannelContinuity` is pure and stateless. It holds no observations
 * between calls, fetches no URL, changes no social score, and never declares a
 * channel official from ticker or branding alone.
 */
import { buildContinuityEvents } from "./continuityDiff";
import { buildCoverage, buildSourceCoverage, buildTimeline } from "./coverage";
import { buildCrossLinkGraph } from "./crossLinks";
import { buildFindings } from "./findings";
import { adaptSubject } from "./identityKeys";
import { adaptObservation, analysable } from "./observationAdapter";
import {
  CONTINUITY_SCHEMA_VERSION,
  ContinuityError,
  continuityRequestSchema,
  type ContinuityReport,
  type ContinuitySubject,
} from "./schema";

export function inspectChannelContinuity(input: unknown): ContinuityReport {
  const parsed = continuityRequestSchema.safeParse(input);

  if (!parsed.success) {
    throw new ContinuityError("invalid_request", "The channel continuity request could not be read.", parsed.error.flatten());
  }

  const observedAtMs = Date.parse(parsed.data.observedAt);
  if (!Number.isFinite(observedAtMs)) {
    throw new ContinuityError("invalid_observed_at", "The observation time could not be read.");
  }

  const subjects = parsed.data.subjects.map(adaptSubject);
  const subjectsById = new Map<string, ContinuitySubject>(subjects.map((subject) => [subject.subjectId, subject]));

  // Same identity key must not be reused for different subjectIds with conflicting fields.
  const identityOwners = new Map<string, string>();
  for (const subject of subjects) {
    const owner = identityOwners.get(subject.identityKey);
    if (owner && owner !== subject.subjectId) {
      throw new ContinuityError(
        "identity_collision",
        "Two subjects share the same chain/symbol/issuer identity. Same-symbol tokens must stay separate with distinct issuer or contract fields.",
        { identityKey: subject.identityKey, subjectIds: [owner, subject.subjectId] },
      );
    }
    identityOwners.set(subject.identityKey, subject.subjectId);
  }

  const observations = parsed.data.observations.map((observation) => adaptObservation(observation, subjectsById));
  const usable = analysable(observations);

  // Diffs run on all observations including excluded ones for blocked/failure
  // events, but domain/handle comparisons only among analysable + failure markers
  // that buildContinuityEvents already scopes per series.
  const events = buildContinuityEvents(observations);
  const timeline = buildTimeline(observations, events);
  const crossLinks = buildCrossLinkGraph(observations);
  const sourceCoverage = buildSourceCoverage(observations);
  const coverage = buildCoverage(subjects, observations, usable.length, events);
  const findings = buildFindings(observations, events, usable.length);

  return {
    schemaVersion: CONTINUITY_SCHEMA_VERSION,
    observedAt: new Date(observedAtMs).toISOString(),
    subjects,
    observations,
    events,
    timeline,
    crossLinks,
    sourceCoverage,
    findings,
    coverage,
    scoreUnchanged: true,
  };
}

export { ContinuityError } from "./schema";
export type { ContinuityReport } from "./schema";
