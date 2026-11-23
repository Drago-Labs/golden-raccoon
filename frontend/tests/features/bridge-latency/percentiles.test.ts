import { describe, expect, it } from "vitest";
import { routeLatencies } from "@/server/research/bridge-latency/latency";
import { nearestRank } from "@/server/research/bridge-latency/percentiles";
import { analyseBridgeLatency } from "@/server/research/bridge-latency/service";
import { loadFixture } from "./fixtures";
describe("nearest-rank percentiles match the healthy fixture", () => {
  it("reports a median of 30 seconds and a 95th of 50 seconds", () => {
    expect(nearestRank([10, 30, 50], 50)).toBe(30);
    expect(nearestRank([10, 30, 50], 95)).toBe(50);
    const result = analyseBridgeLatency(loadFixture("healthy-bridge.json"));
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(routeLatencies([])).toEqual([]);
    expect(result.report.routes[0]).toMatchObject({ route: "eth-stellar", p50: 30, p95: 50, count: 3 });
  });
});
