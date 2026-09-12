import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  AssetReferenceForm,
  DeviationChart,
  EpisodeTable,
  ObservationCoverage,
} from "@/components/research/peg-observations";
import { USDC_ETH_ID } from "./fixtures";
import {
  type DeviationEpisode,
  type NormalizedObservation,
  type ObservationCoverage as ObservationCoverageType,
  type ObservationWindow,
  type PegDefinition,
} from "@/server/research/peg-observations";

const mockPegDefinition: PegDefinition = {
  assetId: USDC_ETH_ID,
  name: "USD Coin",
  referenceCurrency: "USD",
  declaredTargetValue: 1.0,
  source: "canonical",
  provenance: "Circle official issuance",
  toleranceBps: 50,
  maxGapIntervalMs: 3_600_000,
};

const mockWindow: ObservationWindow = {
  startTime: 1_700_000_000_000,
  endTime: 1_700_000_060_000,
  count: 2,
  minIntervalMs: 60_000,
  maxIntervalMs: 60_000,
  averageIntervalMs: 60_000,
  gapCount: 0,
  maxGapDurationMs: 0,
};

const mockCoverage: ObservationCoverageType = {
  status: "complete",
  totalObservations: 10,
  validObservations: 10,
  duplicateTimestampsResolved: 1,
  outOfOrderObservationsSorted: 2,
  gapsDetected: [],
  missingRateTimestamps: [],
  stalePointCount: 0,
  sourcingLimits: "Observations derived from verified evidence feeds and validated uploads.",
  coveragePercentage: 100,
};

const mockObservations: NormalizedObservation[] = [
  {
    timestamp: 1_700_000_000_000,
    rawPrice: 1.0,
    rawCurrency: "USD",
    normalizedPrice: 1.0,
    referenceCurrency: "USD",
    deviationBps: 0,
    isStale: false,
    isRateMissing: false,
    source: "feed",
  },
  {
    timestamp: 1_700_000_060_000,
    rawPrice: 0.995,
    rawCurrency: "USD",
    normalizedPrice: 0.995,
    referenceCurrency: "USD",
    deviationBps: -50,
    isStale: false,
    isRateMissing: false,
    source: "feed",
  },
];

const mockEpisodes: DeviationEpisode[] = [
  {
    id: "ep-1",
    startIndex: 0,
    endIndex: 1,
    startTime: 1_700_000_000_000,
    endTime: 1_700_000_060_000,
    durationMs: 60_000,
    peakDeviationBps: -50,
    peakTimestamp: 1_700_000_060_000,
    thresholdBps: 50,
    status: "recovered",
    recoveryDurationMs: 60_000,
    direction: "below",
    observationsCount: 2,
  },
];

describe("ObservationCoverage Component", () => {
  it("renders coverage status badge, metrics, and sourcing limitations notice", () => {
    render(<ObservationCoverage coverage={mockCoverage} />);

    expect(screen.getByText("Continuous Coverage")).toBeDefined();
    expect(screen.getByText("Observation Coverage and Continuity")).toBeDefined();
    expect(
      screen.getByText("Observations derived from verified evidence feeds and validated uploads."),
    ).toBeDefined();
    expect(screen.getByText(/100% Window Span/i)).toBeDefined();
  });
});

describe("AssetReferenceForm Component", () => {
  it("renders preset selection buttons and handles form submission", () => {
    const onSubmit = vi.fn();
    render(
      <AssetReferenceForm
        initialValues={{
          presetId: "usdc-eth",
          fixture: "usd-and-nonusd-targets",
          thresholdBps: 50,
          gapToleranceMinutes: 60,
          isCustomAsset: false,
          customAsset: {
            symbol: "USDC",
            network: "ethereum",
            chainFamily: "evm",
            addressOrIssuer: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
            referenceCurrency: "USD",
            declaredTargetValue: 1.0,
          },
        }}
        onSubmit={onSubmit}
        isLoading={false}
      />,
    );

    const runButton = screen.getByRole("button", { name: /Execute Deviation Analysis/i });
    expect(runButton).toBeDefined();

    fireEvent.click(runButton);
    expect(onSubmit).toHaveBeenCalled();
  });
});

describe("DeviationChart Component", () => {
  it("renders accessible SVG chart with threshold guide lines and accessible table toggle", () => {
    render(
      <DeviationChart
        observations={mockObservations}
        thresholdBps={50}
        pegDefinition={mockPegDefinition}
        window={mockWindow}
        gaps={[]}
      />,
    );

    const svg = document.querySelector("svg");
    expect(svg).toBeDefined();
    expect(svg?.getAttribute("role")).toBe("img");

    const toggleButton = screen.getByRole("button", { name: /Show Data Table/i });
    expect(toggleButton).toBeDefined();

    fireEvent.click(toggleButton);
    expect(screen.getByText(/Hide Data Table/i)).toBeDefined();
  });
});

describe("EpisodeTable Component", () => {
  it("renders semantic accessible table with column headers and episode status badge", () => {
    render(<EpisodeTable episodes={mockEpisodes} />);

    expect(screen.getByText("Observed Threshold Episodes & Recovery")).toBeDefined();
    expect(screen.getByText("Recovered")).toBeDefined();
    expect(screen.getByText(/-50/)).toBeDefined();
  });
});
