/**
 * Public entry point for coordinated-activity pattern analysis.
 *
 * `analyseCoordination` is pure and stateless. It holds no observations between
 * calls, changes no social score or recommendation, and asks for nothing beyond
 * what the caller already supplied.
 */
import { buildParticipation, distinctAuthorCount } from "./authorGroups";
import { buildClusters } from "./burstDetection";
import { buildFindings, insufficientEvidenceFinding } from "./coordination";
import { adaptObservation, analysable } from "./observationAdapter";
import { buildCoverage, buildSamplingNotice } from "./sampling";
import { bucketObservations } from "./timeBuckets";
import {
  COORDINATION_SCHEMA_VERSION,
  COORDINATION_THRESHOLDS,
  CoordinationError,
  coordinationRequestSchema,
  type CoordinationReport,
} from "./schema";

export function analyseCoordination(input: unknown): CoordinationReport {
  const parsed = coordinationRequestSchema.safeParse(input);

  if (!parsed.success) {
    throw new CoordinationError("invalid_request", "The coordination request could not be read.", parsed.error.flatten());
  }

  const observedAtMs = Date.parse(parsed.data.observedAt);

  if (!Number.isFinite(observedAtMs)) {
    throw new CoordinationError("invalid_observed_at", "The observation time could not be read.");
  }

  const observations = parsed.data.observations.map(adaptObservation);
  const usable = analysable(observations);

  const clusters = buildClusters(usable);
  const { buckets, missingTimestampCount } = bucketObservations(usable, COORDINATION_THRESHOLDS.burstBucketSeconds);
  const participation = buildParticipation(usable, clusters);

  const sampling = buildSamplingNotice(
    observations,
    usable,
    missingTimestampCount,
    !parsed.data.sampleIsExhaustive,
  );
  const coverage = buildCoverage(sampling);
  const findings =
    coverage.state === "insufficient"
      ? [insufficientEvidenceFinding(usable.length, distinctAuthorCount(usable))]
      : buildFindings(usable, clusters, buckets, participation);

  return {
    schemaVersion: COORDINATION_SCHEMA_VERSION,
    observedAt: new Date(observedAtMs).toISOString(),
    thresholds: COORDINATION_THRESHOLDS,
    observations,
    clusters,
    timeline: buckets,
    participation,
    findings,
    sampling,
    coverage,
    scoreUnchanged: true,
  };
}

export { CoordinationError } from "./schema";
export type { CoordinationReport } from "./schema";
