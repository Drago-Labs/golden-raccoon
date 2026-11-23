import { describe, expect, it } from "vitest";
import { readDeliveries } from "@/server/research/bridge-latency/deliveryEvents";
import { matchTransfers } from "@/server/research/bridge-latency/matching";
import { readSends } from "@/server/research/bridge-latency/sendEvents";
import { withinWindow } from "@/server/research/bridge-latency/windowing";
import { loadFixture } from "./fixtures";
describe("sends match deliveries by message id", () => {
  it("pairs three healthy messages and leaves a missing id unmatched", () => {
    const fixture = loadFixture("healthy-bridge.json") as { sends: unknown; deliveries: unknown; now: number };
    const sends = withinWindow(readSends(fixture.sends), fixture.now, 10000);
    const result = matchTransfers(sends, readDeliveries(fixture.deliveries));
    expect(result.matched.map((row) => row.latencySeconds)).toEqual([10, 30, 50]);
    expect(result.unmatched).toHaveLength(0);
  });
});
