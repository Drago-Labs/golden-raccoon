/**
 * Threshold episodes and observed recovery durations.
 *
 * Two rules keep this honest over sparse data:
 *
 * 1. An episode opens at the first *observation* at or beyond the threshold and
 *    closes at the first *observation* back inside it. Neither boundary is
 *    interpolated, so a duration is always "between two things we saw".
 * 2. If a gap falls inside an episode, the duration is marked a lower bound.
 *    The peg may have recovered and broken again unobserved.
 *
 * A threshold comparison is `>=` on the absolute basis-point deviation, so a
 * value exactly at the threshold opens an episode. That boundary is documented
 * rather than left to the reader to discover.
 */
import { gapWithin } from "./windows";
import type { DeviationEpisode, ObservationGap, ObservationPoint } from "./schema";

export function findEpisodes(
  points: ObservationPoint[],
  gaps: ObservationGap[],
  thresholdBps: number,
): DeviationEpisode[] {
  const episodes: DeviationEpisode[] = [];

  let current: {
    startedAt: string;
    peak: number;
    direction: "above_target" | "below_target";
    count: number;
  } | null = null;

  const close = (recoveredAt: string | null) => {
    if (!current) return;

    const endIso = recoveredAt ?? current.startedAt;
    const containsGap = gapWithin(gaps, current.startedAt, endIso);
    const duration =
      recoveredAt === null ? null : Math.floor((Date.parse(recoveredAt) - Date.parse(current.startedAt)) / 1_000);

    episodes.push({
      startedAt: current.startedAt,
      recoveredAt,
      observedDurationSeconds: duration,
      peakDeviationBps: current.peak,
      direction: current.direction,
      observationCount: current.count,
      containsGap,
      note:
        recoveredAt === null
          ? "No observation inside the threshold follows this episode. Recovery was not observed; it is not known to have failed either."
          : containsGap
            ? "An observation gap falls inside this episode, so the duration is a lower bound. The peg may have recovered and broken again unobserved."
            : "Both boundaries are observed points, with no gap between them.",
    });

    current = null;
  };

  for (const point of points) {
    // An unconverted observation says nothing about deviation. It neither opens
    // an episode nor closes one: treating it as a recovery would manufacture a
    // recovery out of missing data.
    if (point.deviationBps === null) continue;

    const magnitude = Math.abs(point.deviationBps);
    const direction = point.deviationBps >= 0 ? "above_target" : "below_target";

    if (magnitude >= thresholdBps) {
      if (current && current.direction !== direction) {
        // The peg crossed through target to the other side without an
        // in-threshold observation. That is two episodes, not one.
        close(point.observedAt);
      }

      if (!current) {
        current = { startedAt: point.observedAt, peak: point.deviationBps, direction, count: 1 };
        continue;
      }

      current.count += 1;
      if (Math.abs(point.deviationBps) > Math.abs(current.peak)) current.peak = point.deviationBps;
      continue;
    }

    close(point.observedAt);
  }

  close(null);

  return episodes;
}

/** Largest absolute deviation actually observed, in basis points. */
export function worstDeviation(points: ObservationPoint[]): number | null {
  const values = points.map((point) => point.deviationBps).filter((value): value is number => value !== null);

  if (values.length === 0) return null;

  return values.reduce((worst, value) => (Math.abs(value) > Math.abs(worst) ? value : worst), values[0]);
}
