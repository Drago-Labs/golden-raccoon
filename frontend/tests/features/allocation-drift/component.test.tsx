import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CoverageNotice } from "@/components/research/allocation-drift/CoverageNotice";
import { DriftHistoryChart } from "@/components/research/allocation-drift/DriftHistoryChart";
import { DriftTable } from "@/components/research/allocation-drift/DriftTable";
import { DriftTracker } from "@/components/research/allocation-drift/DriftTracker";
import { TargetEditor } from "@/components/research/allocation-drift/TargetEditor";
import { ThresholdSettings } from "@/components/research/allocation-drift/ThresholdSettings";
import { inspectAllocationDrift } from "@/server/research/allocation-drift";
import type { AllocationResult } from "@/server/research/allocation-drift/schema";
import { driftPoint } from "@/server/research/allocation-drift/drift";
import {
  allocationRequest,
  balancedTarget,
  currentSnapshot,
  DAI,
  earlierSnapshot,
  unpricedSnapshot,
  USDC,
  wallet,
  WETH,
} from "./fixtures";

vi.mock("@/lib/offlineStore", () => ({ readOfflineState: () => ({ portfolios: [] }) }));

async function recordedResult(): Promise<AllocationResult> {
  return inspectAllocationDrift(
    { ...allocationRequest({ windowStart: "2026-11-01T00:00:00.000Z" }), targets: balancedTarget(), history: [earlierSnapshot()] },
    { readPortfolio: async () => currentSnapshot() },
  );
}

describe("DriftTable", () => {
  it("publishes every drift measure as a column with a row header per asset", async () => {
    const report = (await recordedResult()).report!;
    render(<DriftTable rows={report.current.rows} />);
    for (const column of ["Asset or group", "Current USD", "Current bps", "Target bps", "Drift bps", "Restore USD", "Asset quantity"]) {
      expect(screen.getByRole("columnheader", { name: column })).toBeTruthy();
    }
    const wethRow = screen.getByRole("rowheader", { name: new RegExp(`^WETH\\s*${WETH}$`) }).closest("tr")!;
    expect([...wethRow.querySelectorAll("td")].map((cell) => cell.textContent)).toEqual([
      "60000",
      "6000",
      "5000",
      "1000",
      "-10000",
      "-4",
    ]);
  });

  it("says a measure is unavailable rather than showing a zero", () => {
    render(<DriftTable rows={driftPoint(unpricedSnapshot(), balancedTarget()).rows} />);
    expect(screen.getAllByText("Unavailable").length).toBeGreaterThan(0);
  });
});

describe("DriftHistoryChart", () => {
  it("gives the chart a text alternative holding every recorded value", async () => {
    const report = (await recordedResult()).report!;
    render(<DriftHistoryChart history={report.history} />);
    expect(screen.getByRole("img", { name: /data table below provides every value/ })).toBeTruthy();
    expect(screen.getByText(/Text alternative/)).toBeTruthy();
    expect(screen.getByRole("rowheader", { name: "2026-11-20T00:00:00.000Z" }).closest("tr")!.textContent).toContain("1000");
  });

  it("explains that one observation is not a history", async () => {
    const report = (await recordedResult()).report!;
    render(<DriftHistoryChart history={report.history.slice(0, 1)} />);
    expect(screen.getByText(/At least two priced observations/)).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
  });
});

describe("ThresholdSettings and CoverageNotice", () => {
  it("lists the observations where the threshold was crossed", async () => {
    const report = (await recordedResult()).report!;
    render(<ThresholdSettings crossings={report.crossings} />);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain("moved above the absolute drift threshold (1000 bps)");
  });

  it("says plainly when no crossing could be established", () => {
    render(<ThresholdSettings crossings={[]} />);
    expect(screen.getByText(/No crossing could be established/)).toBeTruthy();
  });

  it("publishes the coverage notes in a labelled region", async () => {
    const report = (await recordedResult()).report!;
    render(<CoverageNotice notes={report.coverage} />);
    const region = screen.getByRole("complementary", { name: "Evidence coverage" });
    expect(region.textContent).toContain("USD market values");
  });
});

describe("TargetEditor", () => {
  it("refuses a target that does not total one hundred percent", () => {
    const onAnalyze = vi.fn();
    render(<TargetEditor snapshot={currentSnapshot()} initial={null} busy={false} onAnalyze={onAnalyze} />);
    fireEvent.click(screen.getByRole("button", { name: "Save target and calculate drift" }));
    expect(screen.getByRole("alert").textContent).toMatch(/sum to exactly 100%/);
    expect(onAnalyze).not.toHaveBeenCalled();
  });

  it("hands a validated target and threshold to the caller in basis points", () => {
    const onAnalyze = vi.fn();
    render(<TargetEditor snapshot={currentSnapshot()} initial={null} busy={false} onAnalyze={onAnalyze} />);
    const percentages = screen.getAllByLabelText("Target %");
    fireEvent.change(percentages[0], { target: { value: "50" } });
    fireEvent.change(percentages[1], { target: { value: "40" } });
    fireEvent.change(percentages[2], { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText("Drift threshold (%)"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Save target and calculate drift" }));
    expect(onAnalyze).toHaveBeenCalledWith(balancedTarget(), 500);
  });

  it("starts from an existing target when one is stored", () => {
    render(<TargetEditor snapshot={currentSnapshot()} initial={balancedTarget()} busy={false} onAnalyze={vi.fn()} />);
    expect(screen.getAllByLabelText("Target %").map((input) => (input as HTMLInputElement).value)).toEqual(["50", "40", "10"]);
  });
});

describe("DriftTracker", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("reads a portfolio, renders the drift evidence and states nothing is submitted", async () => {
    const result = await recordedResult();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(result), { status: 200, headers: { "content-type": "application/json" } }));

    render(<DriftTracker />);
    expect(screen.getByText(/never builds or submits a trade/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Public portfolio wallet"), { target: { value: wallet } });
    fireEvent.click(screen.getByRole("button", { name: "Read portfolio" }));

    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Calculation complete."));
    expect(fetchMock).toHaveBeenCalledWith("/api/insights/allocation-drift", expect.objectContaining({ method: "POST" }));
    expect(screen.getByText("Current weights, drift and restoration amounts (USD)")).toBeTruthy();
    expect(screen.getByRole("heading", { name: `${wallet} · ethereum` })).toBeTruthy();
    expect(screen.getAllByRole("rowheader", { name: new RegExp(`^USDC\\s*${USDC}$`) })).toHaveLength(1);
    expect(screen.getByRole("rowheader", { name: new RegExp(`^DAI\\s*${DAI}$`) })).toBeTruthy();
  });

  it("shows the provider's own explanation when no portfolio could be read", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ state: "unavailable", snapshot: null, report: null, reason: "Portfolio provider unavailable. No holdings or prices were fabricated." }),
        { status: 503, headers: { "content-type": "application/json" } },
      ),
    );

    render(<DriftTracker />);
    fireEvent.change(screen.getByLabelText("Public portfolio wallet"), { target: { value: wallet } });
    fireEvent.click(screen.getByRole("button", { name: "Read portfolio" }));

    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/No holdings or prices were fabricated/));
    expect(screen.queryByText("Current weights, drift and restoration amounts (USD)")).toBeNull();
  });
});
