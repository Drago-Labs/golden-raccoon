/**
 * Gap detection over a sparse observation series.
 *
 * A gap is an interval the data says nothing about. Recording them explicitly
 * is what stops the rest of the feature from implying that a deviation
 * continued, or that a recovery happened, during an unobserved stretch.
 */
import type { ObservationGap, ObservationPoint } from "./schema";

export function findGaps(points: ObservationPoint[], maxGapSeconds: number): ObservationGap[] {
  const gaps: ObservationGap[] = [];

  for (let index = 1; index < points.length; index += 1) {
    const previous = Date.parse(points[index - 1].observedAt);
    const current = Date.parse(points[index].observedAt);
    const gapSeconds = Math.floor((current - previous) / 1_000);

    if (gapSeconds > maxGapSeconds) {
      gaps.push({
        afterObservedAt: points[index - 1].observedAt,
        beforeObservedAt: points[index].observedAt,
        gapSeconds,
        note: `No observation for ${gapSeconds} seconds. Nothing is asserted about the peg during this interval — neither that it held nor that it broke.`,
      });
    }
  }

  return gaps;
}

/**
 * Fraction of the window actually covered by observed intervals.
 *
 * An interval counts as covered when consecutive observations are closer
 * together than the gap bound. Returns `null` for a window of zero length.
 */
export function observedWindowFraction(
  points: ObservationPoint[],
  maxGapSeconds: number,
  windowStartMs: number,
  windowEndMs: number,
): number | null {
  const windowMs = windowEndMs - windowStartMs;
  if (windowMs <= 0 || points.length < 2) return points.length > 0 ? 0 : null;

  let coveredMs = 0;

  for (let index = 1; index < points.length; index += 1) {
    const previous = Date.parse(points[index - 1].observedAt);
    const current = Date.parse(points[index].observedAt);
    const spanMs = current - previous;

    if (spanMs <= maxGapSeconds * 1_000) coveredMs += spanMs;
  }

  return Number(Math.min(1, coveredMs / windowMs).toFixed(6));
}

/** True when a gap falls between two timestamps. */
export function gapWithin(gaps: ObservationGap[], startIso: string, endIso: string): boolean {
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);

  return gaps.some((gap) => Date.parse(gap.afterObservedAt) >= start && Date.parse(gap.beforeObservedAt) <= end);
}
