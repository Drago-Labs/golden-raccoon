import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  ExposureMap,
  ExposureGraph,
  DependencyTable,
  ConcentrationPanel,
  CoveragePanel,
} from "@/components/research/exposure-map";
import { generateExposureMap } from "@/server/research/exposure-map/service";
import {
  SHARED_ISSUER_MIXED_CHAIN_HOLDINGS,
  NESTED_CYCLE_HOLDINGS,
  NESTED_CYCLE_CUSTOM_RELATIONSHIPS,
  PARTIAL_PRICES_UNRESOLVED_HOLDINGS,
  EMPTY_PORTFOLIO_HOLDINGS,
} from "./fixtures";

describe("Exposure Map Component: ExposureMap Workbench", () => {
  it("renders summary metric cards and switches between Graph View and Table View", () => {
    const result = generateExposureMap({
      walletAddress: "0x123",
      chain: "ethereum",
      holdings: SHARED_ISSUER_MIXED_CHAIN_HOLDINGS,
    });

    render(<ExposureMap result={result} />);

    expect(screen.getByText("Portfolio Exposure Map")).toBeDefined();
    expect(screen.getByText("Portfolio Value")).toBeDefined();
    expect(screen.getByText("Concentration (HHI)")).toBeDefined();
    expect(screen.getAllByText("Known-Value Ratio").length).toBeGreaterThan(0);
    expect(screen.getByText("Identified Entities")).toBeDefined();

    const tableViewButton = screen.getByRole("button", { name: /Table View/i });
    fireEvent.click(tableViewButton);

    expect(screen.getByPlaceholderText(/Search dependencies/i)).toBeDefined();

    const graphViewButton = screen.getByRole("button", { name: /Graph View/i });
    fireEvent.click(graphViewButton);

    expect(screen.getByText(/Portfolio Assets/i)).toBeDefined();
    expect(screen.getByText(/Shared Dependencies/i)).toBeDefined();
  });

  it("renders cycle alert banner when cycles are detected", () => {
    const result = generateExposureMap({
      walletAddress: "0x123",
      chain: "ethereum",
      holdings: NESTED_CYCLE_HOLDINGS,
      customRelationships: NESTED_CYCLE_CUSTOM_RELATIONSHIPS,
    });

    render(<ExposureMap result={result} />);

    expect(screen.getByText(/Circular Dependencies Severed/i)).toBeDefined();
  });

  it("renders empty state when portfolio has no holdings", () => {
    const result = generateExposureMap({
      walletAddress: "0x123",
      chain: "ethereum",
      holdings: EMPTY_PORTFOLIO_HOLDINGS,
    });

    render(<ExposureMap result={result} />);

    expect(screen.getByText(/No Holdings Found/i)).toBeDefined();
  });
});

describe("Exposure Map Component: DependencyTable", () => {
  it("filters items by search query and type selector", () => {
    const result = generateExposureMap({
      walletAddress: "0x123",
      chain: "ethereum",
      holdings: SHARED_ISSUER_MIXED_CHAIN_HOLDINGS,
    });

    render(
      <DependencyTable
        issuers={result.groupedExposures.byIssuer}
        protocols={result.groupedExposures.byProtocol}
        underlyings={result.groupedExposures.byUnderlying}
      />
    );

    const searchInput = screen.getByPlaceholderText(/Search dependencies/i);
    fireEvent.change(searchInput, { target: { value: "Circle" } });

    expect(screen.getByText("Circle")).toBeDefined();

    fireEvent.change(searchInput, { target: { value: "NonExistentProtocol" } });
    expect(screen.getByText("No matching dependencies found.")).toBeDefined();
  });

  it("expands contributing holdings on row click and keyboard Enter", () => {
    const result = generateExposureMap({
      walletAddress: "0x123",
      chain: "ethereum",
      holdings: SHARED_ISSUER_MIXED_CHAIN_HOLDINGS,
    });

    render(
      <DependencyTable
        issuers={result.groupedExposures.byIssuer}
        protocols={result.groupedExposures.byProtocol}
        underlyings={result.groupedExposures.byUnderlying}
      />
    );

    const circleButton = screen.getByText("Circle").closest("div[role='button']");
    expect(circleButton).toBeDefined();

    fireEvent.click(circleButton!);
    expect(screen.getByText("stellar-pubnet")).toBeDefined();

    fireEvent.keyDown(circleButton!, { key: "Enter" });
  });
});

describe("Exposure Map Component: ConcentrationPanel", () => {
  it("renders HHI score, classification badge, and dominant entities", () => {
    const result = generateExposureMap({
      walletAddress: "0x123",
      chain: "ethereum",
      holdings: SHARED_ISSUER_MIXED_CHAIN_HOLDINGS,
    });

    render(
      <ConcentrationPanel
        concentration={result.concentration}
        issuers={result.groupedExposures.byIssuer}
        protocols={result.groupedExposures.byProtocol}
      />
    );

    expect(screen.getByText(/Herfindahl-Hirschman Index/i)).toBeDefined();
    expect(screen.getByText(/Dominant Entity Exposure/i)).toBeDefined();
  });
});

describe("Exposure Map Component: CoveragePanel", () => {
  it("renders coverage ratio, priced holdings count, and unpriced assets", () => {
    const result = generateExposureMap({
      walletAddress: "0x123",
      chain: "ethereum",
      holdings: PARTIAL_PRICES_UNRESOLVED_HOLDINGS,
    });

    render(<CoveragePanel coverage={result.coverage} />);

    expect(screen.getByText(/Coverage & Integrity/i)).toBeDefined();
    expect(screen.getByText("71.4%")).toBeDefined();
    expect(screen.getByText(/Unpriced Assets/i)).toBeDefined();
    expect(screen.getByText(/Unresolved Holdings/i)).toBeDefined();
  });
});

describe("Exposure Map Component: ExposureGraph", () => {
  it("allows selecting nodes and highlights active connections", () => {
    const result = generateExposureMap({
      walletAddress: "0x123",
      chain: "ethereum",
      holdings: SHARED_ISSUER_MIXED_CHAIN_HOLDINGS,
    });

    render(
      <ExposureGraph
        nodes={result.nodes}
        edges={result.edges}
      />
    );

    const circleNode = screen.getByText("Circle");
    fireEvent.click(circleNode);

    expect(screen.getByText("Selected Node")).toBeDefined();
  });
});
