import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CorrelationWorkbench } from "@/components/research/holding-correlation/CorrelationWorkbench";
import { wallet } from "./fixtures";

const walletMock = vi.hoisted(() => ({ address: "0x9999999999999999999999999999999999999999" }));
vi.mock("@/hooks/useWalletSession", () => ({
  useWalletSession: () => ({ family: "evm", address: walletMock.address, isConnected: Boolean(walletMock.address) }),
}));

const sampleResponse = {
  network: "ethereum",
  walletAddress: wallet,
  windowDays: 30,
  clusterThreshold: 0.75,
  state: "complete",
  includedAssets: [
    { assetId: "ETH", symbol: "ETH", pointCount: 5 },
    { assetId: "STETH", symbol: "stETH", pointCount: 5 },
  ],
  pairs: [
    { assetA: "ETH", assetB: "STETH", sampleSize: 5, insufficientOverlap: false, pearson: 0.9999, spearman: 1.0 },
  ],
  clusters: [{ clusterId: "cluster-1", threshold: 0.75, assets: ["ETH", "STETH"], minPairwisePearson: 0.9999 }],
  exclusions: [],
  coverage: {
    reachedProvider: true,
    holdingsEvaluated: 2,
    holdingsIncluded: 2,
    holdingsExcluded: 0,
    minOverlapPoints: 5,
    windowDays: 30,
  },
  warnings: [],
};

describe("CorrelationWorkbench", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    walletMock.address = wallet;
  });

  it("renders accessible table and cluster results on submit", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(sampleResponse), { status: 200, headers: { "content-type": "application/json" } }),
    );
    render(<CorrelationWorkbench />);
    fireEvent.click(screen.getByRole("button", { name: "Measure holding correlation" }));
    await waitFor(() => expect(screen.getByRole("region", { name: "Holding correlation results" })).toBeTruthy());
    expect(screen.getByText("ETH, STETH")).toBeTruthy();
    expect(screen.getByText("Coverage")).toBeTruthy();
  });
});
