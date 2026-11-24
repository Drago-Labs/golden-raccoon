import { STABLECOIN_FLOW_LIMITS } from "./limits";
import { StablecoinFlowError } from "./errors";

export type ResolvedWindow = { start: string; end: string; startMs: number; endMs: number; days: number };

/** The window as the report states it, with its length in whole UTC days. */
export function resolveWindow(windowStart: string, windowEnd: string): ResolvedWindow {
  const startMs = Date.parse(windowStart);
  const endMs = Date.parse(windowEnd);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs >= endMs) {
    throw new StablecoinFlowError("invalid_request", "The window must start before it ends.");
  }
  if (endMs - startMs > STABLECOIN_FLOW_LIMITS.maxWindowDays * 86_400_000) {
    throw new StablecoinFlowError("invalid_request", `A window may cover at most ${STABLECOIN_FLOW_LIMITS.maxWindowDays} days.`);
  }
  return {
    start: new Date(startMs).toISOString(),
    end: new Date(endMs).toISOString(),
    startMs,
    endMs,
    days: Math.ceil((endMs - startMs) / 86_400_000),
  };
}

export function withinWindow(at: string, window: ResolvedWindow): boolean {
  const ms = Date.parse(at);
  return Number.isFinite(ms) && ms >= window.startMs && ms <= window.endMs;
}

/** The UTC day an instant is aggregated into. */
export function dayOf(at: string): string {
  const ms = Date.parse(at);
  if (!Number.isFinite(ms)) throw new StablecoinFlowError("malformed_response", `"${at}" is not a usable timestamp.`);
  return new Date(ms).toISOString().slice(0, 10);
}

/** Every UTC day the window touches, so a day with no event is still a row. */
export function daysInWindow(window: ResolvedWindow): string[] {
  const days: string[] = [];
  for (let ms = Date.UTC(
    new Date(window.startMs).getUTCFullYear(),
    new Date(window.startMs).getUTCMonth(),
    new Date(window.startMs).getUTCDate(),
  ); ms <= window.endMs; ms += 86_400_000) {
    days.push(new Date(ms).toISOString().slice(0, 10));
  }
  return days;
}

export type BlockRange = { fromBlock: number; toBlock: number; coversWindowStart: boolean };

/**
 * Derives the block range to scan for a time window from the chain's nominal
 * block time. An EVM node cannot be asked for "blocks since a timestamp", so
 * the range is derived and every event is then filtered by the timestamp the
 * chain actually recorded. When the derived range cannot reach back to the
 * start of the window — a young chain, or a span longer than the reader may
 * page through — that is reported rather than hidden.
 */
export function deriveBlockRange(
  latestBlock: number,
  latestBlockAt: string,
  secondsPerBlock: number,
  window: ResolvedWindow,
): BlockRange {
  if (!Number.isInteger(latestBlock) || latestBlock < 0) {
    throw new StablecoinFlowError("malformed_response", "The provider did not report a usable latest block.");
  }
  const latestMs = Date.parse(latestBlockAt);
  if (!Number.isFinite(latestMs)) {
    throw new StablecoinFlowError("malformed_response", "The provider did not report a usable latest block time.");
  }
  const seconds = Math.max(secondsPerBlock, 0.1);
  const blocksBack = (fromMs: number) => Math.ceil(Math.max(latestMs - fromMs, 0) / 1000 / seconds);
  const toBlock = Math.max(latestBlock - blocksBack(window.endMs), 0);
  // A negative wanted block means the chain itself is younger than the start of
  // the window: there is no block to read there, so the window is not covered.
  const wanted = latestBlock - blocksBack(window.startMs);
  const maxSpan = STABLECOIN_FLOW_LIMITS.maxLogPages * STABLECOIN_FLOW_LIMITS.blocksPerLogPage;
  const fromBlock = Math.max(wanted, toBlock - maxSpan + 1, 0);
  return { fromBlock, toBlock, coversWindowStart: wanted >= 0 && fromBlock <= wanted };
}
