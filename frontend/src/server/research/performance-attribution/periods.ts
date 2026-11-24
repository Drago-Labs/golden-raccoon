import { AttributionError } from "./errors";
import { ATTRIBUTION_LIMITS } from "./limits";
import type { PortfolioObservation } from "./schema";

export type Period = { start: string; end: string; label: string };

export type ResolvedWindow = { start: string; end: string; startMs: number; endMs: number };

export function resolveWindow(windowStart: string, windowEnd: string): ResolvedWindow {
  const startMs = Date.parse(windowStart);
  const endMs = Date.parse(windowEnd);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs >= endMs) {
    throw new AttributionError("invalid_request", "The window must start before it ends.");
  }
  if (endMs - startMs > ATTRIBUTION_LIMITS.maxWindowDays * 86_400_000) {
    throw new AttributionError("invalid_request", `A window may cover at most ${ATTRIBUTION_LIMITS.maxWindowDays} days.`);
  }
  return { start: new Date(startMs).toISOString(), end: new Date(endMs).toISOString(), startMs, endMs };
}

function startOfDay(ms: number): number {
  const date = new Date(ms);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/**
 * Splits the window into consecutive UTC periods. Boundaries are aligned to the
 * granularity — days to midnight, weeks to Monday, months to the first — and
 * the first and last period are clipped to the window itself, so no period
 * covers time the caller did not ask about.
 */
export function buildPeriods(window: ResolvedWindow, granularity: "day" | "week" | "month"): Period[] {
  const periods: Period[] = [];
  let cursor = window.startMs;

  while (cursor < window.endMs) {
    const date = new Date(cursor);
    let next: number;
    if (granularity === "day") {
      next = startOfDay(cursor) + 86_400_000;
    } else if (granularity === "week") {
      const weekday = (date.getUTCDay() + 6) % 7; // Monday = 0
      next = startOfDay(cursor) + (7 - weekday) * 86_400_000;
    } else {
      next = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
    }
    const end = Math.min(next, window.endMs);
    periods.push({
      start: new Date(cursor).toISOString(),
      end: new Date(end).toISOString(),
      label: label(cursor, granularity),
    });
    if (periods.length > ATTRIBUTION_LIMITS.maxPeriods) {
      throw new AttributionError(
        "invalid_request",
        `That window and granularity would need more than ${ATTRIBUTION_LIMITS.maxPeriods} periods. Choose a coarser granularity.`,
      );
    }
    cursor = end;
  }

  return periods;
}

function label(ms: number, granularity: "day" | "week" | "month"): string {
  const iso = new Date(ms).toISOString();
  if (granularity === "month") return iso.slice(0, 7);
  if (granularity === "week") return `week of ${iso.slice(0, 10)}`;
  return iso.slice(0, 10);
}

/**
 * The observations that bound a period: the latest observation at or before
 * its start, and the latest at or before its end. A period with no observation
 * on one side is reported as unavailable rather than being given a neighbour's
 * value.
 */
export function boundObservations(
  period: Period,
  observations: PortfolioObservation[],
): { start: PortfolioObservation | null; end: PortfolioObservation | null } {
  const startMs = Date.parse(period.start);
  const endMs = Date.parse(period.end);
  let start: PortfolioObservation | null = null;
  let end: PortfolioObservation | null = null;
  for (const observation of observations) {
    const at = Date.parse(observation.at);
    if (at <= startMs) start = observation;
    if (at <= endMs && at > startMs) end = observation;
  }
  return { start, end };
}
