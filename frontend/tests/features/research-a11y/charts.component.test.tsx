import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LifetimeChart } from "@/components/research/storage-lifetime/LifetimeChart";
import { DeviationChart } from "@/components/research/peg-observations/DeviationChart";
import { DepthChart } from "@/components/research/liquidity-depth/DepthChart";
import type { ObservationPoint } from "@/server/research/peg-observations/schema";
import type { AssetIdentity, DepthLevel } from "@/server/research/liquidity-depth/schema";

describe("research workspace chart equivalents", () => {
  it("exposes a lifetime table that preserves unavailable observations", () => {
    render(
      <LifetimeChart
        entries={[
          {
            keyXdr: "AAAA",
            kind: "contract_data",
            durability: "persistent",
            state: "live",
            liveUntilLedger: 100,
            remainingLedgers: 40,
            estimatedSecondsRemaining: 200,
            evidence: [],
          },
          {
            keyXdr: "BBBB",
            kind: "contract_code",
            durability: "temporary",
            state: "missing",
            liveUntilLedger: null,
            remainingLedgers: null,
            estimatedSecondsRemaining: null,
            evidence: ["unavailable"],
          },
        ]}
      />,
    );

    expect(screen.getByRole("table", { name: /Storage lifetime values/i })).toBeTruthy();
    expect(screen.getAllByText("unavailable").length).toBeGreaterThan(0);
    expect(screen.getByText("40")).toBeTruthy();
  });

  it("keeps deviation charts decorative (aria-hidden svg)", () => {
    const observations: ObservationPoint[] = [
      {
        observedAt: "2026-09-01T00:00:00.000Z",
        rawPrice: "1.001",
        rawCurrency: "USD",
        referencePrice: "1.001",
        deviationBps: 10,
        unavailableReason: null,
        sourceLabel: "fixture",
        stale: false,
      },
      {
        observedAt: "2026-09-01T00:01:00.000Z",
        rawPrice: "1",
        rawCurrency: "EUR",
        referencePrice: null,
        deviationBps: null,
        unavailableReason: "unconverted",
        sourceLabel: "fixture",
        stale: false,
      },
    ];
    const { container } = render(
      <DeviationChart observations={observations} thresholdBps={50} maxGapSeconds={120} />,
    );
    expect(container.querySelector("svg[aria-hidden='true']")).toBeTruthy();
  });

  it("keeps depth charts decorative (aria-hidden svg)", () => {
    const levels: DepthLevel[] = [
      {
        price: "1.0",
        baseAmount: "100",
        cumulativeBaseAmount: "100",
        cumulativeQuoteAmount: "100",
      },
      {
        price: "1.1",
        baseAmount: "50",
        cumulativeBaseAmount: "150",
        cumulativeQuoteAmount: "155",
      },
    ];
    const base: AssetIdentity = {
      chainId: "1",
      family: "evm",
      symbol: "USDC",
      decimals: 6,
      identityKey: "evm:1:usdc",
    };
    const { container } = render(<DepthChart levels={levels} base={base} />);
    expect(container.querySelector("svg[aria-hidden='true']")).toBeTruthy();
  });
});
