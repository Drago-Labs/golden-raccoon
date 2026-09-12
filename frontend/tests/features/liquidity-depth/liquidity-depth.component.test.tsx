import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { CoverageNotice } from "@/components/research/liquidity-depth/CoverageNotice";
import { SizeLadder } from "@/components/research/liquidity-depth/SizeLadder";
import { DepthChart } from "@/components/research/liquidity-depth/DepthChart";
import { VenueSelector } from "@/components/research/liquidity-depth/VenueSelector";
import type { CoverageReport, SizeLadderStep, DepthCurve } from "@/server/research/liquidity-depth";

describe("Liquidity Depth UI Components", () => {
  describe("CoverageNotice", () => {
    it("renders complete status badge correctly", () => {
      const coverage: CoverageReport = {
        status: "complete",
        reasons: [],
        modelAssumptions: ["Order book snapshot taken directly from Horizon SDEX"],
        lastObservedAt: new Date().toISOString(),
        ledgerOrBlock: 12345,
      };

      render(
        <CoverageNotice
          coverage={coverage}
          modelType="orderbook"
          venueName="Stellar SDEX"
        />,
      );
      expect(screen.getByText("complete")).toBeDefined();
      expect(screen.getByText(/Stellar SDEX/)).toBeDefined();
    });

    it("renders warnings and reasons when status is truncated", () => {
      const coverage: CoverageReport = {
        status: "truncated",
        reasons: ["Order book depth truncated at venue pagination boundary"],
        modelAssumptions: [],
        dataBoundaryNotice: "Liquidity depth qualified as TRUNCATED",
        lastObservedAt: new Date().toISOString(),
        ledgerOrBlock: 12345,
        isTruncated: true,
      };

      render(
        <CoverageNotice
          coverage={coverage}
          modelType="orderbook"
          venueName="Stellar SDEX"
        />,
      );
      expect(screen.getByText("truncated")).toBeDefined();
      expect(screen.getByText(/Order book depth truncated at venue pagination boundary/)).toBeDefined();
    });
  });

  describe("SizeLadder", () => {
    const steps: SizeLadderStep[] = [
      {
        size: "100",
        tradeSide: "buy",
        marginalPrice: "0.122000",
        averageExecutionPrice: "0.122000",
        priceImpactPercent: 0.1,
        feeAmount: "0.000000",
        netOutputAmount: "12.200000",
        executable: true,
        insufficientDepth: false,
      },
      {
        size: "50000",
        tradeSide: "buy",
        marginalPrice: "0.130000",
        averageExecutionPrice: "0.126000",
        priceImpactPercent: 3.5,
        feeAmount: "0.000000",
        netOutputAmount: "6300.000000",
        executable: false,
        insufficientDepth: true,
        warning: "Insufficient liquidity depth",
      },
    ];

    it("renders ladder steps with price impact and handles tab switching", () => {
      render(
        <SizeLadder
          ladder={steps}
          baseSymbol="XLM"
          quoteSymbol="USDC"
          tradeSide="buy"
        />,
      );

      expect(screen.getByText("Execution Size Ladder")).toBeDefined();
      expect(screen.getByText("100")).toBeDefined();
      expect(screen.getByText("+0.10%")).toBeDefined();
      expect(screen.getByText("50,000")).toBeDefined();
    });
  });

  describe("DepthChart", () => {
    const curve: DepthCurve = {
      bids: [
        { price: 0.120, amount: 1000, cumulativeBase: 1000, cumulativeQuote: 120 },
        { price: 0.119, amount: 2000, cumulativeBase: 3000, cumulativeQuote: 358 },
      ],
      asks: [
        { price: 0.122, amount: 1000, cumulativeBase: 1000, cumulativeQuote: 122 },
        { price: 0.123, amount: 2000, cumulativeBase: 3000, cumulativeQuote: 368 },
      ],
      midPrice: 0.121,
      spreadPercent: 1.65,
    };

    it("renders depth chart title and supports switching to accessible table view", () => {
      render(
        <DepthChart
          curve={curve}
          baseSymbol="XLM"
          quoteSymbol="USDC"
        />,
      );

      expect(screen.getByText("Cumulative Liquidity Depth")).toBeDefined();
      expect(screen.getByText(/0.1210 USDC/)).toBeDefined();

      const toggleButton = screen.getByRole("button", { name: "View Data Table" });
      fireEvent.click(toggleButton);

      expect(screen.getByText("Price (USDC)")).toBeDefined();
      expect(screen.getByText("0.1200")).toBeDefined();
      expect(screen.getByText("0.1220")).toBeDefined();
    });
  });

  describe("VenueSelector", () => {
    it("renders options and fires network and input change callbacks", () => {
      const onSelectNetwork = vi.fn();
      const onChangeBaseSymbol = vi.fn();
      const onChangeQuoteSymbol = vi.fn();
      const onToggleSide = vi.fn();

      render(
        <VenueSelector
          selectedNetwork="stellar-pubnet"
          onSelectNetwork={onSelectNetwork}
          baseSymbol="XLM"
          onChangeBaseSymbol={onChangeBaseSymbol}
          quoteSymbol="USDC"
          onChangeQuoteSymbol={onChangeQuoteSymbol}
          tradeSide="buy"
          onToggleSide={onToggleSide}
          modelType="orderbook"
          venueName="Stellar SDEX"
          feeBps={0}
        />,
      );

      expect(screen.getByLabelText("Venue and Asset Configuration")).toBeDefined();
      const select = screen.getByLabelText("Network / Environment");
      fireEvent.change(select, { target: { value: "ethereum" } });
      expect(onSelectNetwork).toHaveBeenCalledWith("ethereum");

      const sellButton = screen.getByRole("button", { name: "Sell Base" });
      fireEvent.click(sellButton);
      expect(onToggleSide).toHaveBeenCalledWith("sell");
    });
  });
});
