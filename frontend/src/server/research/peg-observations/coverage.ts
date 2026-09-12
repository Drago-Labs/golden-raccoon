import {
  type GapInterval,
  type ObservationCoverage,
  type ObservationCoverageStatus,
  type ObservationWindow,
} from "./schema";

export type CoverageEvaluationParams = {
  totalObservations: number;
  validObservations: number;
  duplicateTimestampsResolved: number;
  outOfOrderObservationsSorted: number;
  gaps: GapInterval[];
  missingRateTimestamps: number[];
  stalePointCount: number;
  window: ObservationWindow;
  hasInterruptedEpisode?: boolean;
  isUnsupportedAsset?: boolean;
};

/**
 * Evaluates observation coverage quality, gap frequency, and sourcing limitations.
 * Distinguishes completely covered spans from sparse, partial, gap-interrupted, or unavailable states.
 */
export function evaluateObservationCoverage(
  params: CoverageEvaluationParams,
): ObservationCoverage {
  const {
    totalObservations,
    validObservations,
    duplicateTimestampsResolved,
    outOfOrderObservationsSorted,
    gaps,
    missingRateTimestamps,
    stalePointCount,
    window,
    hasInterruptedEpisode,
    isUnsupportedAsset,
  } = params;

  if (isUnsupportedAsset) {
    return {
      status: "unavailable",
      totalObservations: 0,
      validObservations: 0,
      duplicateTimestampsResolved: 0,
      outOfOrderObservationsSorted: 0,
      gapsDetected: [],
      missingRateTimestamps: [],
      stalePointCount: 0,
      sourcingLimits:
        "Asset peg definition not recognized and no valid explicit peg declaration provided. Historical observation unavailable.",
      coveragePercentage: 0,
    };
  }

  if (totalObservations === 0 || validObservations === 0) {
    return {
      status: "empty",
      totalObservations,
      validObservations: 0,
      duplicateTimestampsResolved,
      outOfOrderObservationsSorted,
      gapsDetected: [],
      missingRateTimestamps: [],
      stalePointCount: 0,
      sourcingLimits:
        "No historical observations recorded in the selected observation window.",
      coveragePercentage: 0,
    };
  }

  const windowDuration = Math.max(1, window.endTime - window.startTime);
  const totalGapDuration = gaps.reduce((acc, gap) => acc + gap.durationMs, 0);
  const observedDuration = Math.max(0, windowDuration - totalGapDuration);
  const rawCoveragePercent = Math.min(
    100,
    Math.max(0, Math.round((observedDuration / windowDuration) * 100)),
  );

  let status: ObservationCoverageStatus = "complete";

  if (missingRateTimestamps.length > 0) {
    if (missingRateTimestamps.length === validObservations) {
      status = "missing_reference_rates";
    } else {
      status = "partial";
    }
  } else if (hasInterruptedEpisode) {
    status = "gap_interrupted";
  } else if (gaps.length > 0 && totalGapDuration / windowDuration > 0.4) {
    status = "sparse";
  } else if (gaps.length > 0 || stalePointCount > 0) {
    status = "partial";
  }

  const sourcingLimits =
    "Observations derived from verified evidence feeds and validated uploads. Unobserved intervals are strictly treated as gaps without generating synthetic prices or assuming market peg recovery.";

  return {
    status,
    totalObservations,
    validObservations,
    duplicateTimestampsResolved,
    outOfOrderObservationsSorted,
    gapsDetected: gaps,
    missingRateTimestamps,
    stalePointCount,
    sourcingLimits,
    coveragePercentage: rawCoveragePercent,
  };
}
