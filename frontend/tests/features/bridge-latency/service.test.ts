import { describe, expect, it } from "vitest";
import { BridgeLatencyError } from "@/server/research/bridge-latency/errors";
import { BRIDGE_LATENCY_LIMITS } from "@/server/research/bridge-latency/limits";
import { analyseBridgeLatency } from "@/server/research/bridge-latency";
import { loadFixture } from "./fixtures";
describe("bridge latency typed states", () => {
  it("returns unknown_format for an unrecognized message format and unavailable when the provider times out", () => {
    expect(analyseBridgeLatency(loadFixture("unmatched-format.json")).kind).toBe("unknown_format");
    expect(analyseBridgeLatency(loadFixture("provider-unavailable.json"))).toEqual({ kind: "unavailable", reason: "The bridge indexer timed out." });
    expect(new BridgeLatencyError("x", "y").code).toBe("x");
    expect(BRIDGE_LATENCY_LIMITS.defaultStuckSeconds).toBe(3600);
  });
});
