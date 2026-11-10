import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VolatilityProfile } from "@/components/research/volatility-profile/VolatilityProfile";
import { wallet } from "./fixtures";

const walletMock = vi.hoisted(() => ({ address: "0x9999999999999999999999999999999999999999" }));
vi.mock("@/hooks/useWalletSession", () => ({
  useWalletSession: () => ({ family: "evm", address: walletMock.address, isConnected: Boolean(walletMock.address) }),
}));

const sampleResult = {
  network: "ethereum",
  assetSymbol: "XLM",
  interval: "1d",
  windowDays: 30,
  state: "complete",
  volatility: { sampleSize: 4, periodVolatility: 0.05, annualisedVolatility: 0.955, annualisationFactor: 365 },
  drawdown: {
    maxDrawdownPct: 50,
    peakTimestamp: 86400,
    troughTimestamp: 259200,
    recoveryTimestamp: 432000,
    drawdownDurationSeconds: 172800,
    recoveryDurationSeconds: 172800,
    series: [{ timestamp: 86400, drawdownPct: 0 }],
  },
  gaps: [],
  comparison: null,
  coverage: {
    reachedProvider: true,
    source: "recorded-feed",
    interval: "1d",
    observationsRead: 5,
    validReturnSteps: 4,
    gapsDetected: 0,
    outliersDetected: 0,
  },
  warnings: [],
};

describe("VolatilityProfile", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    walletMock.address = wallet;
  });

  it("submits and renders accessible volatility and drawdown metrics", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(sampleResult), { status: 200, headers: { "content-type": "application/json" } }),
    );
    render(<VolatilityProfile />);
    fireEvent.click(screen.getByRole("button", { name: "Profile volatility" }));
    await waitFor(() => expect(screen.getByRole("region", { name: "Volatility profile results" })).toBeTruthy());
    expect(screen.getByText("50.00%")).toBeTruthy();
    expect(screen.getByText("Coverage")).toBeTruthy();
  });
});
