/**
 * The time-horizon window a snapshot's outcome is checked within.
 *
 * Not to be confused with Stellar's Horizon API, which `outcomeDetection.ts`
 * reads price history from — this module is purely about the calendar
 * window, with no network calls.
 */
import type { HorizonDays } from "./schema";

export type HorizonWindow = {
  windowStart: string;
  windowEnd: string;
  hasElapsed: boolean;
};

export function computeHorizonWindow(publishedAt: string, horizonDays: HorizonDays, evaluatedAt: string): HorizonWindow {
  const start = Date.parse(publishedAt);
  const end = start + horizonDays * 24 * 60 * 60 * 1000;
  const now = Date.parse(evaluatedAt);

  return {
    windowStart: new Date(start).toISOString(),
    windowEnd: new Date(end).toISOString(),
    hasElapsed: now >= end,
  };
}
