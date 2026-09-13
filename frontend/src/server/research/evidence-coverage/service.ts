/**
 * Public entry point for the evidence coverage explorer.
 *
 * `exploreEvidence` is pure. It reads a report the caller already holds and
 * returns a coverage document. It never recomputes a score, never fetches a
 * source URL, and never forwards a provider payload.
 */
import { buildClaimCoverage } from "./claimIndex";
import { findContradictions } from "./conflicts";
import { buildReportCoverage } from "./coverage";
import { buildTimeline } from "./freshness";
import { buildFamilyResolver } from "./provenanceGroups";
import { adaptObservation } from "./sourceAdapter";
import {
  EVIDENCE_SCHEMA_VERSION,
  EvidenceError,
  evidenceRequestSchema,
  type ClaimCoverage,
  type Contradiction,
  type EvidenceReport,
  type SourceObservation,
} from "./schema";

export function exploreEvidence(input: unknown): EvidenceReport {
  const parsed = evidenceRequestSchema.safeParse(input);

  if (!parsed.success) {
    throw new EvidenceError("invalid_request", "The evidence request could not be read.", parsed.error.flatten());
  }

  const request = parsed.data;
  const generatedAtMs = Date.parse(request.generatedAt);

  if (!Number.isFinite(generatedAtMs)) {
    throw new EvidenceError("invalid_generated_at", "The report timestamp could not be read.");
  }

  const { resolve, declared } = buildFamilyResolver(request.families);

  const allObservations: SourceObservation[] = [];
  const claims: ClaimCoverage[] = [];
  const contradictions: Contradiction[] = [];
  const incomparablePairs: Contradiction[] = [];
  let redactedFieldCount = 0;

  for (const claim of request.claims) {
    const adapted = claim.observations.map((observation) => {
      const result = adaptObservation(observation, resolve, {
        generatedAtMs,
        staleAfterSeconds: request.staleAfterSeconds,
      });
      redactedFieldCount += result.droppedFieldCount;
      return result.observation;
    });

    const scan = findContradictions(claim, adapted);

    allObservations.push(...adapted);
    contradictions.push(...scan.contradictions);
    incomparablePairs.push(...scan.incomparablePairs);
    claims.push(buildClaimCoverage(claim, adapted, scan.contradictions, scan.agreeingPairCount));
  }

  return {
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    reportId: request.reportId,
    generatedAt: new Date(generatedAtMs).toISOString(),
    families: declared,
    claims,
    observations: allObservations,
    contradictions,
    incomparablePairs,
    timeline: buildTimeline(allObservations),
    coverage: buildReportCoverage(claims, redactedFieldCount),
  };
}

export { EvidenceError } from "./schema";
export type { EvidenceReport } from "./schema";
