import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AssetSelector } from "@/components/research/stablecoin-flows/AssetSelector";
import { CoverageNotice } from "@/components/research/stablecoin-flows/CoverageNotice";
import { EventList } from "@/components/research/stablecoin-flows/EventList";
import { FlowChart } from "@/components/research/stablecoin-flows/FlowChart";
import { StablecoinFlows } from "@/components/research/stablecoin-flows/StablecoinFlows";
import { WindowSelector } from "@/components/research/stablecoin-flows/WindowSelector";
import { trackStablecoinFlows } from "@/server/research/stablecoin-flows";
import { readEvmFlowEvents } from "@/server/research/stablecoin-flows/evmEvents";
import { readStellarFlowEvents } from "@/server/research/stablecoin-flows/stellarEvents";
import type { StablecoinFlowResult } from "@/server/research/stablecoin-flows/schema";
import { clone, fixtures, flowRequest, HORIZON, recordedFetch } from "./fixtures";

afterEach(() => vi.restoreAllMocks());

/** The report the recorded fixture produces, so the UI is tested against real service output. */
async function recordedResult(fixture: unknown = fixtures.multiChain, chains = ["ethereum", "stellar"]) {
  const fetchMock = recordedFetch(clone(fixture) as never);
  vi.stubGlobal("fetch", fetchMock);
  const result = await trackStablecoinFlows(flowRequest({ chains }), {
    readEvm: (deployment, window) => readEvmFlowEvents(`https://${deployment.chain}.test.invalid`, deployment, window),
    readStellar: (deployment, window) => readStellarFlowEvents(HORIZON, deployment, window),
  });
  vi.restoreAllMocks();
  return result;
}

describe("AssetSelector", () => {
  it("lists the configured assets and their chains, and clears chains when the asset changes", () => {
    const onAssetChange = vi.fn();
    const onChainsChange = vi.fn();
    render(
      <AssetSelector
        assetId="usdc"
        chains={["ethereum"]}
        busy={false}
        onAssetChange={onAssetChange}
        onChainsChange={onChainsChange}
      />,
    );
    expect(screen.getByRole("option", { name: "USDC — USD Coin" })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "stellar" })).toBeTruthy();
    expect((screen.getByRole("checkbox", { name: "ethereum" }) as HTMLInputElement).checked).toBe(true);

    fireEvent.change(screen.getByLabelText("Stablecoin"), { target: { value: "usdt" } });
    expect(onAssetChange).toHaveBeenCalledWith("usdt");
    expect(onChainsChange).toHaveBeenCalledWith([]);
  });

  it("adds and removes a chain without touching the others", () => {
    const onChainsChange = vi.fn();
    render(
      <AssetSelector
        assetId="usdc"
        chains={["ethereum"]}
        busy={false}
        onAssetChange={vi.fn()}
        onChainsChange={onChainsChange}
      />,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "stellar" }));
    expect(onChainsChange).toHaveBeenCalledWith(["ethereum", "stellar"]);
    fireEvent.click(screen.getByRole("checkbox", { name: "ethereum" }));
    expect(onChainsChange).toHaveBeenCalledWith([]);
  });
});

describe("WindowSelector", () => {
  it("submits the chosen window and states the documented bound", () => {
    const onSubmit = vi.fn();
    render(
      <WindowSelector
        start="2026-11-18T00:00"
        end="2026-11-20T00:00"
        topEvents={10}
        busy={false}
        onStartChange={vi.fn()}
        onEndChange={vi.fn()}
        onTopEventsChange={vi.fn()}
        onSubmit={onSubmit}
      />,
    );
    expect(screen.getByText(/at most 90 days/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Read flows" }));
    expect(onSubmit).toHaveBeenCalled();
  });
});

describe("FlowChart", () => {
  it("gives the chart a text alternative carrying every daily value", async () => {
    const result = await recordedResult();
    render(<FlowChart daily={result.report.daily} coverage={result.report.coverage} symbol="USDC" />);
    expect(screen.getByRole("img", { name: /data table below this chart carries every value/ })).toBeTruthy();
    const row = screen.getAllByRole("rowheader", { name: "2026-11-18" })[0].closest("tr")!;
    expect([...row.querySelectorAll("td")].map((cell) => cell.textContent)).toEqual([
      "ethereum",
      "Complete",
      "1000000",
      "250000",
      "750000",
      "2",
    ]);
  });

  it("marks a chain with incomplete coverage in the table as well as the chart", async () => {
    const result = await recordedResult(fixtures.partialCoverage, ["ethereum", "base"]);
    render(<FlowChart daily={result.report.daily} coverage={result.report.coverage} symbol="USDC" />);
    expect(screen.getAllByText("Incomplete").length).toBeGreaterThan(0);
  });

  it("says plainly when no day in the window has a flow", () => {
    render(<FlowChart daily={[]} coverage={[]} symbol="USDC" />);
    expect(screen.getByText(/No day in this window has a recorded flow/)).toBeTruthy();
  });
});

describe("EventList", () => {
  it("links every ranked event to its own transaction", async () => {
    const result = await recordedResult();
    render(<EventList events={result.report.largestEvents} symbol="USDC" />);
    const largest = result.report.largestEvents[0];
    const link = screen.getByRole("link", { name: largest.txId });
    expect(link.getAttribute("href")).toBe(largest.txUrl);
    expect(link.getAttribute("rel")).toContain("noreferrer");
    expect(screen.getAllByRole("link")).toHaveLength(result.report.largestEvents.length);
  });

  it("says plainly when nothing was recorded", () => {
    render(<EventList events={[]} symbol="USDC" />);
    expect(screen.getByText(/No mint or burn was recorded/)).toBeTruthy();
  });
});

describe("CoverageNotice", () => {
  it("states each chain's coverage, its source and the report's own notes", async () => {
    const result = await recordedResult(fixtures.partialCoverage, ["ethereum", "base"]);
    render(<CoverageNotice coverage={result.report.coverage} notes={result.report.notes} />);
    const region = screen.getByRole("complementary", { name: "Evidence coverage" });
    expect(region.textContent).toContain("Not read");
    expect(region.textContent).toContain("Incomplete");
    expect(region.textContent).toMatch(/absent from every total: ethereum/);
    expect(screen.getByRole("link", { name: /0x833589/ })).toBeTruthy();
  });
});

describe("StablecoinFlows", () => {
  it("reads flows, states net issuance and renders the evidence", async () => {
    const result = await recordedResult();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(result), { status: 200, headers: { "content-type": "application/json" } }));

    render(<StablecoinFlows />);
    expect(screen.getByText(/forecasts no peg behaviour/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Read flows" }));

    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toBe("Report complete. Net issuance 410000 USDC across 2 day(s)."),
    );
    expect(fetchMock).toHaveBeenCalledWith("/api/insights/stablecoin-flows", expect.objectContaining({ method: "POST" }));
    expect(screen.getByRole("region", { name: "Net issuance" }).textContent).toContain("Net 410000 USDC");
    expect(screen.getByRole("region", { name: "Daily net issuance" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Largest single events" })).toBeTruthy();
    expect(screen.getByRole("complementary", { name: "Evidence coverage" })).toBeTruthy();
  });

  it("shows the service's own reason, and the coverage, when nothing could be read", async () => {
    const unavailable: StablecoinFlowResult = {
      state: "unavailable",
      reason: "No configured chain could be read for this asset. No mint, burn or net issuance was inferred.",
      report: {
        state: "unavailable",
        asset: { id: "usdc", symbol: "USDC", name: "USD Coin", canonicalDecimals: 7 },
        window: { start: "2026-11-18T00:00:00.000Z", end: "2026-11-20T00:00:00.000Z", days: 2 },
        daily: [],
        netIssuance: { mintUnits: "0", burnUnits: "0", netUnits: "0", mint: "0", burn: "0", net: "0", eventCount: 0 },
        netByChain: [],
        largestEvents: [],
        coverage: [
          {
            chain: "ethereum",
            state: "unavailable",
            eventCount: 0,
            truncated: false,
            firstEventAt: null,
            lastEventAt: null,
            notes: ["ethereum could not be read."],
            identity: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
            sourceUrl: "https://www.circle.com/multi-chain-usdc",
          },
        ],
        notes: ["Not read, and therefore absent from every total: ethereum."],
        readOnly: true,
      },
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(unavailable), { status: 503, headers: { "content-type": "application/json" } }),
    );

    render(<StablecoinFlows />);
    fireEvent.click(screen.getByRole("button", { name: "Read flows" }));

    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/No mint, burn or net issuance was inferred/));
    expect(screen.getByRole("complementary", { name: "Evidence coverage" }).textContent).toContain("Not read");
    expect(screen.queryByRole("region", { name: "Net issuance" })).toBeNull();
  });
});
