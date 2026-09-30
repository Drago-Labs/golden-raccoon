import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OracleDivergenceWorkbench } from "@/components/research/oracle-divergence/OracleDivergenceWorkbench";

describe("OracleDivergenceWorkbench", () => {
  it("labels the request input and the submit control so the flow is reachable by keyboard", () => {
    render(<OracleDivergenceWorkbench />);
    expect(screen.getByLabelText(/Request JSON/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Compare feeds to quotes" })).toBeTruthy();
  });

  it("renders the comparison table by role once a report comes back", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          report: {
            schemaVersion: "oracle-divergence/2026-01",
            windowStart: "2026-01-01T00:00:00Z",
            windowEnd: "2026-01-01T06:00:00Z",
            pairs: [
              {
                pair: { pairId: "eth-usd", baseAsset: "ETH", quoteAsset: "USD" },
                comparisons: [{ observedAt: "2026-01-01T00:05:00Z", sourceLabel: "DEX TWAP", quotePrice: "1801.10", feedId: "chainlink-eth-usd", state: "compared", oracleRoundId: "1", oracleUpdatedAt: "2026-01-01T00:00:00Z", oraclePrice: "1800", spreadBps: 6, note: "" }],
                feedSummaries: [{ feedId: "chainlink-eth-usd", providerLabel: "Chainlink", comparedCount: 1, staleCount: 0, missingCount: 0, maxAbsSpreadBps: 6, averageSpreadBps: 6 }],
              },
            ],
            unmappedFeedIds: [],
            unmappedQuotePairIds: [],
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    render(<OracleDivergenceWorkbench />);
    fireEvent.click(screen.getByRole("button", { name: "Compare feeds to quotes" }));

    await waitFor(() => expect(screen.getByText("ETH/USD")).toBeTruthy());
    expect(screen.getAllByRole("table")).toHaveLength(2);
    expect(screen.getByText("Chainlink")).toBeTruthy();
  });

  it("shows an alert for invalid JSON without calling the API", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(<OracleDivergenceWorkbench />);
    fireEvent.change(screen.getByLabelText(/Request JSON/), { target: { value: "{not json" } });
    fireEvent.click(screen.getByRole("button", { name: "Compare feeds to quotes" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("not valid JSON"));
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
