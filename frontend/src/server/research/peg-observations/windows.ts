import {
  type GapInterval,
  type ObservationWindow,
  type RawObservation,
} from "./schema";

export type WindowAnalysisResult = {
  window: ObservationWindow;
  filteredObservations: RawObservation[];
  gaps: GapInterval[];
};

/**
 * Bounds observations to the designated time window and analyzes sampling continuity and gaps.
 */
export function calculateObservationWindow(
  observations: RawObservation[],
  options?: {
    startTime?: number;
    endTime?: number;
    gapToleranceMs?: number;
  },
): WindowAnalysisResult {
  if (observations.length === 0) {
    const start = options?.startTime ?? 0;
    const end = options?.endTime ?? start;
    return {
      window: {
        startTime: start,
        endTime: end,
        count: 0,
        minIntervalMs: 0,
        maxIntervalMs: 0,
        averageIntervalMs: 0,
        gapCount: 0,
        maxGapDurationMs: 0,
      },
      filteredObservations: [],
      gaps: [],
    };
  }

  const windowStart = options?.startTime !== undefined ? options.startTime : observations[0].timestamp;
  const windowEnd =
    options?.endTime !== undefined ? options.endTime : observations[observations.length - 1].timestamp;

  const filtered = observations.filter(
    (obs) => obs.timestamp >= windowStart && obs.timestamp <= windowEnd,
  );

  const gapToleranceMs = options?.gapToleranceMs ?? 3_600_000;
  const gaps: GapInterval[] = [];

  if (filtered.length <= 1) {
    return {
      window: {
        startTime: windowStart,
        endTime: windowEnd,
        count: filtered.length,
        minIntervalMs: 0,
        maxIntervalMs: 0,
        averageIntervalMs: 0,
        gapCount: 0,
        maxGapDurationMs: 0,
      },
      filteredObservations: filtered,
      gaps: [],
    };
  }

  let minInterval = Number.MAX_SAFE_INTEGER;
  let maxInterval = 0;
  let sumIntervals = 0;
  let maxGap = 0;

  for (let i = 1; i < filtered.length; i += 1) {
    const delta = filtered[i].timestamp - filtered[i - 1].timestamp;
    if (delta < minInterval) minInterval = delta;
    if (delta > maxInterval) maxInterval = delta;
    sumIntervals += delta;

    if (delta > gapToleranceMs) {
      gaps.push({
        startTime: filtered[i - 1].timestamp,
        endTime: filtered[i].timestamp,
        durationMs: delta,
      });
      if (delta > maxGap) maxGap = delta;
    }
  }

  const averageInterval = sumIntervals / (filtered.length - 1);

  return {
    window: {
      startTime: windowStart,
      endTime: windowEnd,
      count: filtered.length,
      minIntervalMs: minInterval === Number.MAX_SAFE_INTEGER ? 0 : minInterval,
      maxIntervalMs: maxInterval,
      averageIntervalMs: Math.round(averageInterval),
      gapCount: gaps.length,
      maxGapDurationMs: maxGap,
    },
    filteredObservations: filtered,
    gaps,
  };
}
