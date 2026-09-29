import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExposureMap } from "@/components/research/exposure-map/ExposureMap";
import { buildExposureMap } from "@/server/research/exposure-map/service";
import { ExposureMapError } from "@/server/research/exposure-map/schema";
import { emptyPortfolio, nestedCycleDoubleCounting, partialPricesUnresolved, sharedIssuerMixedChain } from "./fixtures";

/**
 * Backs the component's `fetch` with the real domain service, so the rendered
 * output is the document the route would produce, without a socket.
 */
function installServiceFetch(options: { delayMs?: number; portfolioFails?: boolean } = {}) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (options.delayMs) await new Promise((resolve) => setTimeout(resolve, options.delayMs));

    if (url.startsWith("/api/portfolio")) {
      if (options.portfolioFails) return { ok: false, status: 503, json: async () => ({}) } as unknown as Response;
      return {
        ok: true,
        status: 200,
        json: async () => ({ holdings: sharedIssuerMixedChain.holdings, createdAt: "2026-01-05T00:00:00.000Z" }),
      } as unknown as Response;
    }

    try {
      const result = buildExposureMap(JSON.parse(String(init?.body ?? "{}")));
      return {
        ok: true,
        status: 200,
        json: async () => ({ map: result.map, unmatchedDeclarations: result.unmatchedDeclarations }),
      } as unknown as Response;
    } catch (error) {
      const failure = error as ExposureMapError;
      return { ok: false, status: 400, json: async () => ({ error: failure.code, message: failure.message }) } as unknown as Response;
    }
  });

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ExposureMap", () => {
  it("shows an explicit empty state with no wallet", () => {
    installServiceFetch();
    render(<ExposureMap walletAddress={null} network={null} />);

    expect(screen.getByText(/No wallet is selected/i)).toBeTruthy();
  });

  it("groups holdings that share a declared issuer", async () => {
    installServiceFetch();
    render(<ExposureMap input={sharedIssuerMixedChain} />);

    // The fixture declares the same issuer on two networks, which must stay
    // two group rows rather than collapsing into one.
    const groups = await screen.findByRole("table", { name: /Grouped exposure/i });
    expect(within(groups).getAllByText("Centre Consortium")).toHaveLength(2);
  });

  it("states that group totals overlap and do not sum to the portfolio", async () => {
    installServiceFetch();
    render(<ExposureMap input={sharedIssuerMixedChain} />);

    await screen.findAllByText("Centre Consortium");
    expect(screen.getAllByText(/do not sum to the portfolio/i).length).toBeGreaterThan(0);
  });

  it("lists unresolved holdings with their reason", async () => {
    installServiceFetch();
    render(<ExposureMap input={partialPricesUnresolved} />);

    const unresolved = await screen.findByTestId("unresolved-holdings");
    expect(within(unresolved).getByText("MYST")).toBeTruthy();
    expect(within(unresolved).getByText("LONE")).toBeTruthy();
    expect(within(unresolved).getAllByText(/No usable price/i).length).toBeGreaterThan(0);
  });

  it("shows a dropped cycle edge as not counted", async () => {
    installServiceFetch();
    render(<ExposureMap input={nestedCycleDoubleCounting} />);

    await screen.findAllByText("Alpha Pool");
    expect(screen.getAllByText(/Cycle — not counted/i).length).toBeGreaterThan(0);
  });

  it("exposes the same relationships in the table as in the diagram", async () => {
    installServiceFetch();
    render(<ExposureMap input={nestedCycleDoubleCounting} />);

    await screen.findAllByText("Alpha Pool");
    const tableRows = screen.getAllByRole("row").length;

    fireEvent.click(screen.getByRole("button", { name: "Diagram" }));
    await waitFor(() => expect(screen.queryByRole("table", { name: /declared relationship/i })).toBeNull());

    fireEvent.click(screen.getByRole("button", { name: "Table" }));
    await waitFor(() => expect(screen.getAllByRole("row").length).toBe(tableRows));
  });

  it("renders a distinguishable empty map", async () => {
    installServiceFetch();
    render(<ExposureMap input={emptyPortfolio} />);

    await screen.findByText(/no exposure to map/i);
    expect(screen.getByRole("heading", { name: /0 shared dependencies on/i })).toBeTruthy();
  });

  it("surfaces a portfolio load failure without partial output", async () => {
    installServiceFetch({ portfolioFails: true });
    render(<ExposureMap walletAddress="GWALLET" network="stellar-pubnet" />);

    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText(/could not be loaded/i)).toBeTruthy();
    expect(screen.queryAllByText("Centre Consortium")).toHaveLength(0);
  });

  it("drops a rendered map when the wallet changes", async () => {
    installServiceFetch();
    const { rerender } = render(<ExposureMap input={sharedIssuerMixedChain} />);

    await screen.findAllByText("Centre Consortium");

    rerender(<ExposureMap walletAddress={null} network={null} />);

    await waitFor(() => expect(screen.queryAllByText("Centre Consortium")).toHaveLength(0));
    expect(screen.getByText(/No wallet is selected/i)).toBeTruthy();
  });

  it("discards a response that resolves after the wallet moved on", async () => {
    installServiceFetch({ delayMs: 40 });
    const { rerender } = render(<ExposureMap input={sharedIssuerMixedChain} />);

    rerender(<ExposureMap walletAddress={null} network={null} />);

    await new Promise((resolve) => setTimeout(resolve, 120));

    expect(screen.queryAllByText("Centre Consortium")).toHaveLength(0);
    expect(screen.getByText(/No wallet is selected/i)).toBeTruthy();
  });
});
