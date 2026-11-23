import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BridgeLatency } from "@/components/research/bridge-latency/BridgeLatency";
import { analyseBridgeLatency } from "@/server/research/bridge-latency";
import { loadFixture } from "./fixtures";
describe("the latency view has a text alternative", () => {
  it("states the median in text and lists the stuck source transaction", () => {
    render(<BridgeLatency bridges={["cctp"]} initial={analyseBridgeLatency(loadFixture("healthy-bridge.json"))} />);
    expect(screen.getByText(/median 30 seconds/).textContent).toMatch(/30/);
    render(<BridgeLatency bridges={["cctp"]} initial={analyseBridgeLatency(loadFixture("stuck-transfers.json"))} />);
    expect(screen.getByText(/0xstuck/).textContent).toMatch(/0xstuck/);
  });
});
