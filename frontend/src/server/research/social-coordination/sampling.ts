/**
 * Sampling limits.
 *
 * A social sample is almost never exhaustive, so the default assumption is that
 * it is not. The caller must explicitly declare exhaustiveness, and even then
 * the notice records how much of what they supplied could actually be analysed.
 */
import { distinctAuthorCount } from "./authorGroups";
import { COORDINATION_THRESHOLDS, type CoordinationCoverage, type ObservationRef, type SamplingNotice } from "./schema";

export function buildSamplingNotice(
  all: ObservationRef[],
  analysed: ObservationRef[],
  missingTimestampCount: number,
  callerDeclaredPartial: boolean,
): SamplingNotice {
  const notes: string[] = [];

  if (callerDeclaredPartial) {
    notes.push(
      "The caller did not declare this sample exhaustive, so these counts are a lower bound on what exists. A pattern absent here may simply be outside the sample.",
    );
  }

  if (all.length !== analysed.length) {
    notes.push(
      `${all.length - analysed.length} observation${all.length - analysed.length === 1 ? "" : "s"} carried no comparable text and were excluded from repetition analysis. They are still listed, with the reason.`,
    );
  }

  if (missingTimestampCount > 0) {
    notes.push(
      `${missingTimestampCount} observation${missingTimestampCount === 1 ? "" : "s"} carried no readable timestamp and were left out of the timeline entirely. Guessing a time would manufacture synchronization the data does not show.`,
    );
  }

  return {
    analysedFraction: all.length === 0 ? 0 : Number((analysed.length / all.length).toFixed(6)),
    observationCount: all.length,
    analysedCount: analysed.length,
    excludedCount: all.length - analysed.length,
    missingTimestampCount,
    distinctAuthorCount: distinctAuthorCount(analysed),
    callerDeclaredPartial,
    notes,
  };
}

export function buildCoverage(sampling: SamplingNotice): CoordinationCoverage {
  if (sampling.observationCount === 0) {
    return {
      state: "empty",
      note: "No observations were supplied, so there is nothing to analyse.",
    };
  }

  if (
    sampling.analysedCount < COORDINATION_THRESHOLDS.minObservationsForAnalysis ||
    sampling.distinctAuthorCount < COORDINATION_THRESHOLDS.minAuthorsForConcentration
  ) {
    return {
      state: "insufficient",
      note: `This sample is below the published analysis minimums (${COORDINATION_THRESHOLDS.minObservationsForAnalysis} observations, ${COORDINATION_THRESHOLDS.minAuthorsForConcentration} authors). Measurements are shown, but no pattern claim is made.`,
    };
  }

  if (sampling.callerDeclaredPartial || sampling.excludedCount > 0 || sampling.missingTimestampCount > 0) {
    return {
      state: "partial",
      note: "Read these measurements as partial. The sampling notice lists what could not be analysed and why.",
    };
  }

  return {
    state: "complete",
    note: "Every supplied observation carried comparable text and a readable timestamp, and the caller declared the sample exhaustive.",
  };
}
