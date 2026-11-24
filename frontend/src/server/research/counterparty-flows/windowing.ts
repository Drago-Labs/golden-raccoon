import { CounterpartyFlowsError } from "./errors";
import { COUNTERPARTY_FLOW_LIMITS } from "./limits";
import type { WindowPreset } from "./schema";

export type ResolvedWindow = {
  start: string;
  end: string;
  startMs: number;
  endMs: number;
  days: number;
};

const PRESET_DAYS: Record<WindowPreset, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

/** Resolves a preset or custom ISO window into inclusive UTC bounds. */
export function resolveWindow(
  preset: WindowPreset,
  windowStart: string | undefined,
  windowEnd: string | undefined,
  nowMs: number = Date.now(),
): ResolvedWindow {
  if (windowStart && windowEnd) {
    const startMs = Date.parse(windowStart);
    const endMs = Date.parse(windowEnd);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs >= endMs) {
      throw new CounterpartyFlowsError("invalid_request", "The window must start before it ends.");
    }
    if (endMs - startMs > COUNTERPARTY_FLOW_LIMITS.maxWindowDays * 86_400_000) {
      throw new CounterpartyFlowsError(
        "invalid_request",
        `A window may cover at most ${COUNTERPARTY_FLOW_LIMITS.maxWindowDays} days.`,
      );
    }
    return {
      start: new Date(startMs).toISOString(),
      end: new Date(endMs).toISOString(),
      startMs,
      endMs,
      days: Math.ceil((endMs - startMs) / 86_400_000),
    };
  }

  const days = PRESET_DAYS[preset];
  const endMs = nowMs;
  const startMs = endMs - days * 86_400_000;
  return {
    start: new Date(startMs).toISOString(),
    end: new Date(endMs).toISOString(),
    startMs,
    endMs,
    days,
  };
}

export function withinWindow(at: string, window: ResolvedWindow): boolean {
  const ms = Date.parse(at);
  return Number.isFinite(ms) && ms >= window.startMs && ms <= window.endMs;
}
