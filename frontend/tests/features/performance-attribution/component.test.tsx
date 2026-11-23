import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AttributionReport } from "@/components/research/performance-attribution/AttributionReport";
import { AttributionTable } from "@/components/research/performance-attribution/AttributionTable";
import { CoverageNotice } from "@/components/research/performance-attribution/CoverageNotice";
import { PeriodSelector } from "@/components/research/performance-attribution/PeriodSelector";
import { PortfolioSelector } from "@/components/research/performance-attribution/PortfolioSelector";
import { WaterfallChart } from "@/components/research/performance-attribution/WaterfallChart";
import { attributePerformance } from "@/server/research/performance-attribution";
import type { AttributionResult } from "@/server/research/performance-attribution/schema";
import { attributionRequest, recordedHistory, WALLET } from "./fixtures";

vi.mock("@/lib/offlineStore", () => ({ readOfflineState: () => ({ portfolios: [] }) }));

afterEach(() => vi.restoreAllMocks());

/** The report the recorded fixtures produce, so the UI is tested against real service output. */
async function recordedResult(name: Parameters<typeof recordedHistory>[0] = "largeDeposit"): Promise<AttributionResult> {
  return attributePerformance(attributionRequest(name), { readHistory: recordedHistory(name) });
}

describe("PortfolioSelector", () => {
  it("names the portfolio and offers the live read as an explicit choice", () => {
    const onWalletChange = vi.fn();
    const onIncludeLiveChange = vi.fn();
    render(
      <PortfolioSelector
        walletAddress=""
        network="ethereum"
        includeLiveSnapshot={false}
        busy={false}
        onWalletChange={onWalletChange}
        onNetworkChange={vi.fn()}
        onIncludeLiveChange={onIncludeLiveChange}
      />,
    );
    fireEvent.change(screen.getByLabelText("Public portfolio wallet"), { target: { value: WALLET } });
    expect(onWalletChange).toHaveBeenCalledWith(WALLET);
    fireEvent.click(screen.getByRole("checkbox", { name: /live portfolio read/ }));
    expect(onIncludeLiveChange).toHaveBeenCalledWith(true);
  });
});

describe("PeriodSelector", () => {
  it("submits the window and states the documented bounds", () => {
    const onSubmit = vi.fn();
    const onGranularityChange = vi.fn();
    const { container } = render(
      <PeriodSelector
        start="2026-11-18T00:00"
        end="2026-11-19T00:00"
        granularity="day"
        busy={false}
        onStartChange={vi.fn()}
        onEndChange={vi.fn()}
        onGranularityChange={onGranularityChange}
        onSubmit={onSubmit}
      />,
    );
    // The sentence is assembled from JSX expressions, so it is asserted on the rendered text.
    expect(container.textContent).toMatch(/At most 370 days and 120 periods per report/);
    fireEvent.change(screen.getByLabelText("Period"), { target: { value: "month" } });
    expect(onGranularityChange).toHaveBeenCalledWith("month");
    fireEvent.click(screen.getByRole("button", { name: "Attribute performance" }));
    expect(onSubmit).toHaveBeenCalled();
  });
});

describe("AttributionTable", () => {
  it("states each period's change, flows and market movement", async () => {
    const result = await recordedResult();
    render(<AttributionTable periods={result.report.periods} />);
    const row = screen.getByRole("rowheader", { name: "2026-11-18" }).closest("tr")!;
    expect([...row.querySelectorAll("td")].map((cell) => cell.textContent)).toEqual([
      "Complete",
      "20000",
      "31500",
      "11500",
      "10000",
      "1500",
      "1000",
      "500",
    ]);
  });

  it("breaks each period down by asset and by chain", async () => {
    const result = await recordedResult();
    render(<AttributionTable periods={result.report.periods} />);
    expect(screen.getByText("Contribution by asset, 2026-11-18")).toBeTruthy();
    expect(screen.getByText("Contribution by chain, 2026-11-18")).toBeTruthy();
    expect(screen.getAllByRole("rowheader", { name: /WETH/ }).length).toBeGreaterThan(0);
  });

  it("says a figure is unavailable rather than showing a zero", async () => {
    const result = await recordedResult("missingPrices");
    render(<AttributionTable periods={result.report.periods} />);
    expect(screen.getAllByText("Unavailable").length).toBeGreaterThan(0);
    expect(screen.getAllByText("No data").length).toBeGreaterThan(0);
  });
});

describe("WaterfallChart", () => {
  it("gives the chart a text alternative carrying every step", async () => {
    const result = await recordedResult();
    const [period] = result.report.periods;
    render(
      <WaterfallChart totals={result.report.totals} startValueUsd={period.startValueUsd} endValueUsd={period.endValueUsd} />,
    );
    expect(screen.getByRole("img", { name: /table below this chart carries every figure/ })).toBeTruthy();
    for (const [step, value] of [
      ["Start value", "20000"],
      ["External flows", "10000"],
      ["Price effect", "1000"],
      ["Residual", "500"],
      ["End value", "31500"],
    ]) {
      const row = screen.getByRole("rowheader", { name: step }).closest("tr")!;
      expect(row.querySelector("td")?.textContent).toBe(value);
    }
  });

  it("draws no bar for a step it cannot state", async () => {
    const result = await recordedResult("missingPrices");
    render(<WaterfallChart totals={result.report.totals} startValueUsd={null} endValueUsd={null} />);
    expect(screen.getAllByText("Unavailable").length).toBeGreaterThan(0);
  });
});

describe("CoverageNotice", () => {
  it("counts the attributed periods and names the ones it could not attribute", async () => {
    const result = await recordedResult("missingPrices");
    render(<CoverageNotice report={result.report} />);
    const region = screen.getByRole("complementary", { name: "Evidence coverage" });
    expect(region.textContent).toContain("1 period(s) attributed, 2 without the observations needed.");
    expect(region.textContent).toMatch(/No recorded observation inside this period/);
    expect(region.textContent).toMatch(/not tax reporting and not advice/);
  });
});

describe("AttributionReport", () => {
  it("attributes a portfolio and renders the evidence", async () => {
    const result = await recordedResult();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(result), { status: 200, headers: { "content-type": "application/json" } }));

    render(<AttributionReport />);
    expect(screen.getByText(/not tax reporting and not advice/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Public portfolio wallet"), { target: { value: WALLET } });
    fireEvent.click(screen.getByRole("button", { name: "Attribute performance" }));

    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toBe(
        "Report complete. Market movement 1500 USD across 1 attributed period(s).",
      ),
    );
    expect(fetchMock).toHaveBeenCalledWith("/api/insights/performance-attribution", expect.objectContaining({ method: "POST" }));
    expect(screen.getByRole("region", { name: "Attribution waterfall" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Attribution by period" })).toBeTruthy();
    expect(screen.getByRole("complementary", { name: "Evidence coverage" })).toBeTruthy();
  });

  it("shows the service's own reason, and the coverage, when nothing could be attributed", async () => {
    const result = await recordedResult("providerUnavailable");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(result), { status: 503, headers: { "content-type": "application/json" } }),
    );

    render(<AttributionReport />);
    fireEvent.change(screen.getByLabelText("Public portfolio wallet"), { target: { value: WALLET } });
    fireEvent.click(screen.getByRole("button", { name: "Attribute performance" }));

    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/External flows could not be read/));
    expect(screen.getByRole("complementary", { name: "Evidence coverage" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Attribution waterfall" })).toBeNull();
  });
});
