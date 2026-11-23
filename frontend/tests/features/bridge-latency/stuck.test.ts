import { describe, expect, it } from "vitest";
import { parseBridgeId } from "@/server/research/bridge-latency/bridgeRegistry";
import { buildCoverage } from "@/server/research/bridge-latency/coverage";
import { stuckTransfers } from "@/server/research/bridge-latency/stuckTransfers";
import { analyseBridgeLatency } from "@/server/research/bridge-latency/service";
import type { BridgeMessage } from "@/server/research/bridge-latency/schema";
import { loadFixture } from "./fixtures";
describe("unmatched sends older than the threshold are stuck", () => {
  it("lists 0xstuck and keeps the fresh send off the list", () => {
    const result = analyseBridgeLatency(loadFixture("stuck-transfers.json"));
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(result.report.stuck).toEqual([{ id: "stuck1", route: "eth-stellar", bridge: "cctp", tx: "0xstuck", ageSeconds: 9000 }]);
    const fresh: BridgeMessage = { id: "fresh", route: "eth-stellar", sentAt: 9500, tx: "0xfresh", bridge: "cctp" };
    expect(stuckTransfers([fresh], 10000, 1000)).toEqual([]);
    expect(parseBridgeId("cctp")).toBe("cctp");
    expect(buildCoverage("cctp").notes[0]).toMatch(/message id/);
  });
});
