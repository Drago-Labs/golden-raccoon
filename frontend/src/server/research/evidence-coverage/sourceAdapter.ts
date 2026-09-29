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
      // An unavailable source has no value to report, whatever it sent.
      value: observation.status === "unavailable" ? null : (observation.value ?? null),
      windowStart: observation.windowStart ?? null,
      windowEnd: observation.windowEnd ?? null,
      redacted: redaction.redacted,
      note: notes.join(" "),
    },
  };
}
