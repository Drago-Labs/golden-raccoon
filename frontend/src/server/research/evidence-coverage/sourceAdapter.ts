/**
 * Normalizes raw observations into the shape the rest of the feature reads.
 *
 * Freshness is decided here, and the distinction it protects is that a missing
 * timestamp yields `unknown` — never `fresh`. An observation nobody dated is
 * unmeasured, not recent.
 */
import { redactObservation, redactionNote } from "./redaction";
import type { FreshnessState, ObservationInput, SourceObservation } from "./schema";

export type FamilyResolver = (sourceLabel: string) => { familyId: string; familyLabel: string };

/**
 * Classifies the freshness of an observation given its timestamp and generation parameters.
 *
 * @param observedAt ISO timestamp string or null
 * @param generatedAtMs Report generation timestamp in milliseconds
 * @param staleAfterSeconds Seconds threshold after which an observation is considered stale
 * @returns Freshness classification and age in seconds
 */
export function classifyFreshness(
  observedAt: string | null,
  generatedAtMs: number,
  staleAfterSeconds: number,
): { freshness: FreshnessState; ageSeconds: number | null } {
  if (!observedAt) return { freshness: "unknown", ageSeconds: null };

  const observedMs = Date.parse(observedAt);

  if (!Number.isFinite(observedMs)) return { freshness: "unknown", ageSeconds: null };

  const ageSeconds = Math.floor((generatedAtMs - observedMs) / 1_000);

  return { freshness: ageSeconds > staleAfterSeconds ? "stale" : "fresh", ageSeconds };
}

/**
 * Adapts and normalizes a raw observation input into a verified SourceObservation.
 *
 * @param observation Raw observation input
 * @param resolveFamily Resolver to map source labels to family identities
 * @param options Options including generation timestamp and stale threshold
 * @returns Adapted observation and count of dropped fields
 */
export function adaptObservation(
  observation: ObservationInput,
  resolveFamily: FamilyResolver,
  options: { generatedAtMs: number; staleAfterSeconds: number },
): { observation: SourceObservation; droppedFieldCount: number } {
  const family = resolveFamily(observation.sourceLabel);
  const { freshness, ageSeconds } = classifyFreshness(
    observation.observedAt ?? null,
    options.generatedAtMs,
    options.staleAfterSeconds,
  );
  const redaction = redactObservation(observation);

  const notes = [
    observation.status === "unavailable"
      ? "The source was unavailable, so this observation carries no value."
      : freshness === "unknown"
        ? "This observation carries no readable timestamp. Its age is unknown, which is not the same as recent."
        : "",
    redactionNote(redaction),
  ].filter(Boolean);

  return {
    droppedFieldCount: redaction.droppedFieldCount,
    observation: {
      observationId: observation.observationId,
      sourceLabel: observation.sourceLabel,
      familyId: family.familyId,
      familyLabel: family.familyLabel,
      status: observation.status,
      observedAt: observation.observedAt ?? null,
      freshness,
      ageSeconds,
      value: observation.status === "unavailable" ? null : (observation.value ?? null),
      windowStart: observation.windowStart ?? null,
      windowEnd: observation.windowEnd ?? null,
      redacted: redaction.redacted,
      note: notes.join(" "),
    },
  };
}
