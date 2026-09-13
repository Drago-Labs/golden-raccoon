import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PegWorkspace } from "@/components/research/peg-observations/PegWorkspace";
import { PegError } from "@/server/research/peg-observations/schema";
import { analysePegObservations } from "@/server/research/peg-observations/service";
import {
  deviationRecoveryWithGaps,
  emptyRequest,
  missingRatesIdentityCollision,
  usdAndNonUsdTargets,
} from "./fixtures";

function installServiceFetch(options: { delayMs?: number } = {}) {
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    if (options.delayMs) await new Promise((resolve) => setTimeout(resolve, options.delayMs));

    try {
      const report = analysePegObservations(JSON.parse(String(init?.body ?? "{}")));
      return { ok: true, status: 200, json: async () => ({ report }) } as unknown as Response;
    } catch (error) {
      const failure = error as PegError;
      return { ok: false, status: 400, json: async () => ({ error: failure.code, message: failure.message }) } as unknown as Response;
    }
  });

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PegWorkspace", () => {
  it("shows an explicit empty state with no series", () => {
    installServiceFetch();
    render(<PegWorkspace account="0xabc" network="ethereum" />);

    expect(screen.getByText(/No observation series is loaded/i)).toBeTruthy();
  });

  it("renders the declared non-USD target rather than a dollar", async () => {
    installServiceFetch();
    render(<PegWorkspace input={usdAndNonUsdTargets} account="0xabc" network="stellar-pubnet" />);

    await screen.findByRole("radio", { name: /EURC/ });
    fireEvent.click(screen.getByRole("radio", { name: /EURC/ }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /EURC · target 0.83 EUR/i })).toBeTruthy();
    });
    expect(screen.getAllByText(/-100 bps/).length).toBeGreaterThan(0);
  });

  it("names unobserved intervals instead of drawing over them", async () => {
    installServiceFetch();
    render(<PegWorkspace input={deviationRecoveryWithGaps} account="0xabc" network="ethereum" />);

    const gaps = await screen.findByTestId("observation-gaps");
    expect(within(gaps).getByText(/neither that it held nor that it broke/i)).toBeTruthy();
  });

  it("marks an episode spanning a gap as a lower bound", async () => {
    installServiceFetch();
    render(<PegWorkspace input={deviationRecoveryWithGaps} account="0xabc" network="ethereum" />);

    await screen.findByRole("table", { name: /Episodes where an observation sat/i });
    expect(screen.getByText("Spans a gap")).toBeTruthy();
    expect(screen.getAllByText("lower bound").length).toBeGreaterThan(0);
  });

  it("lists an asset with no declared peg rather than analysing it", async () => {
    installServiceFetch();
    render(<PegWorkspace input={missingRatesIdentityCollision} account="0xabc" network="stellar-pubnet" />);

    const undefinedAssets = await screen.findByTestId("undefined-assets");
    expect(within(undefinedAssets).getByText(/not analysed against an assumed one-unit target/i)).toBeTruthy();
  });

  it("shows an unconvertible observation without inventing a price", async () => {
    installServiceFetch();
    render(<PegWorkspace input={missingRatesIdentityCollision} account="0xabc" network="stellar-pubnet" />);

    await screen.findByRole("table", { name: /Every observation in the window/i });
    expect(screen.getByText("Not convertible")).toBeTruthy();
    expect(screen.getByText(/2.50 XLM/)).toBeTruthy();
  });

  it("requires a reference currency when declaring a peg", async () => {
    const fetchMock = installServiceFetch();
    render(<PegWorkspace input={emptyRequest} account="0xabc" network="ethereum" />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText("Network"), { target: { value: "ethereum" } });
    fireEvent.change(screen.getByLabelText("Symbol"), { target: { value: "DAI" } });
    fireEvent.click(screen.getByRole("button", { name: /Declare peg and analyse/i }));

    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "A reference currency is required. This feature does not assume US dollars.",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("renders a distinguishable empty report", async () => {
    installServiceFetch();
    render(<PegWorkspace input={emptyRequest} account="0xabc" network="ethereum" />);

    await screen.findByText(/nothing to analyse/i);
  });

  it("surfaces a failure without partial output", async () => {
    installServiceFetch();
    render(
      <PegWorkspace
        input={{ ...emptyRequest, windowStart: "2026-01-02T00:00:00.000Z", windowEnd: "2026-01-01T00:00:00.000Z" }}
        account="0xabc"
        network="ethereum"
      />,
    );

    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText(/could not be analysed/i)).toBeTruthy();
    expect(screen.queryByTestId("observation-gaps")).toBeNull();
  });

  it("drops a rendered report when the wallet session changes", async () => {
    installServiceFetch();
    const { rerender } = render(<PegWorkspace input={usdAndNonUsdTargets} account="0xabc" network="stellar-pubnet" />);

    await screen.findByRole("radio", { name: /EURC/ });

    rerender(<PegWorkspace account="0xdifferent" network="stellar-pubnet" />);

    await waitFor(() => expect(screen.queryByRole("radio", { name: /EURC/ })).toBeNull());
    expect(screen.getByText(/No observation series is loaded/i)).toBeTruthy();
  });

  it("discards a response that resolves after the session moved on", async () => {
    installServiceFetch({ delayMs: 40 });
    const { rerender } = render(<PegWorkspace input={usdAndNonUsdTargets} account="0xabc" network="stellar-pubnet" />);

    rerender(<PegWorkspace account="0xdifferent" network="stellar-pubnet" />);

    await new Promise((resolve) => setTimeout(resolve, 120));

    expect(screen.queryByRole("radio", { name: /EURC/ })).toBeNull();
    expect(screen.getByText(/No observation series is loaded/i)).toBeTruthy();
  });
});
