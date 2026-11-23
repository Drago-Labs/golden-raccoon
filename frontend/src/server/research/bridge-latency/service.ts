import { parseBridgeId } from "./bridgeRegistry";
import { buildCoverage } from "./coverage";
import { readDeliveries } from "./deliveryEvents";
import { BridgeLatencyError, type WorkState } from "./errors";
import { BRIDGE_LATENCY_LIMITS } from "./limits";
import { routeLatencies } from "./latency";
import { matchTransfers } from "./matching";
import { readSends } from "./sendEvents";
import { stuckTransfers } from "./stuckTransfers";
import { withinWindow } from "./windowing";
import type { BridgeReport } from "./schema";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}
export function analyseBridgeLatency(value: unknown): WorkState<BridgeReport> {
  const body = asRecord(value);
  if (!body) return { kind: "unknown_format", reason: "The bridge payload is not an object." };
  if (body.unavailable === true) return { kind: "unavailable", reason: typeof body.reason === "string" ? body.reason : "The bridge provider did not answer." };
  if (body.format === "unrecognized") return { kind: "unknown_format", reason: "The message format is not one this bridge documents." };
  try {
    const bridge = parseBridgeId(body.bridge);
    const now = typeof body.now === "number" ? body.now : 0;
    const windowSeconds = typeof body.windowSeconds === "number" ? body.windowSeconds : 86_400;
    const threshold = typeof body.stuckAfterSeconds === "number" ? body.stuckAfterSeconds : BRIDGE_LATENCY_LIMITS.defaultStuckSeconds;
    const sends = withinWindow(readSends(body.sends), now, windowSeconds).filter((row) => row.bridge === bridge);
    if (sends.some((row) => row.format !== undefined && row.format !== "standard")) {
      return { kind: "unknown_format", reason: "A message used a format this bridge does not match." };
    }
    const deliveries = readDeliveries(body.deliveries);
    const matched = matchTransfers(sends, deliveries);
    return {
      kind: "ready",
      report: {
        bridge,
        routes: routeLatencies(matched.matched),
        stuck: stuckTransfers(matched.unmatched, now, threshold),
        matched: matched.matched.length,
        coverage: buildCoverage(bridge),
      },
    };
  } catch (error) {
    if (error instanceof BridgeLatencyError) return { kind: "unknown_format", reason: error.message };
    return { kind: "unknown_format", reason: "The bridge payload could not be read." };
  }
}
