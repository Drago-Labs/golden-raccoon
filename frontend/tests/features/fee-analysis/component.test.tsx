import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FeeAnalysisWorkspace } from "@/components/research/fee-analysis/FeeAnalysisWorkspace";
import { FeeAnalysisError } from "@/server/research/fee-analysis/schema";
import { analyseFees } from "@/server/research/fee-analysis/service";
import type { TransactionRecord } from "@/server/types";
import {
  ETH_PRICE,
  EVM_BASE,
  EVM_FAILED,
  EVM_REPLACED,
  EVM_REPLACEMENT,
  EVM_SUCCESS,
  EVM_UNREADABLE,
  FULL_WORLD,
  STELLAR_FEE_BUMP,
  STELLAR_LOCAL_FEE,
  STELLAR_SOURCE,
  WALLET,
  createFeeReader,
} from "./fixtures";

/**
 * The workspace posts a window; the stub runs the real service over a fixed
 * record set, so the component renders the same report shape the endpoint
 * returns. The window in the request is ignored by the stub — the fixtures
 * already sit inside it — which keeps these tests independent of the clock.
 */
function installServiceFetch(
  records: TransactionRecord[],
  options: { delayMs?: number; conversions?: unknown[] } = {},
) {
  return vi.fn(async (_url: string, init?: RequestInit) => {
    if (options.delayMs) await new Promise((resolve) => setTimeout(resolve, options.delayMs));

    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;

    try {
      const report = await analyseFees(
        {
          ...body,
          stellarAccount: STELLAR_SOURCE,
          from: "2026-02-01T00:00:00.000Z",
          to: "2026-03-01T00:00:00.000Z",
          conversions: options.conversions ?? [],
        },
        records,
        createFeeReader(FULL_WORLD),
      );

      return { ok: true, status: 200, json: async () => ({ report }) } as unknown as Response;
    } catch (error) {
      const failure = error as FeeAnalysisError;

      return {
        ok: false,
        status: 400,
        json: async () => ({ error: failure.code ?? "fee_analysis_failed", message: failure.message }),
      } as unknown as Response;
    }
  });
}

function analyse() {
  fireEvent.submit(screen.getByRole("form", { name: /fee analysis period/i }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("FeeAnalysisWorkspace", () => {
  it("starts idle and promises to change no fee policy", () => {
    vi.stubGlobal("fetch", installServiceFetch([EVM_SUCCESS]));
    render(<FeeAnalysisWorkspace account={WALLET} network={null} />);

    expect(screen.getByTestId("fee-idle").textContent).toMatch(/no fee policy\s+changes/i);
  });

  it("labels the period control and the submit action", () => {
    vi.stubGlobal("fetch", installServiceFetch([EVM_SUCCESS]));
    render(<FeeAnalysisWorkspace account={WALLET} network={null} />);

    expect(screen.getByLabelText("Period")).toBeTruthy();
    expect(screen.getByRole("button", { name: /analyse fees/i })).toBeTruthy();
  });

  it("refuses to analyse with no wallet connected", async () => {
    const fetchMock = installServiceFetch([EVM_SUCCESS]);
    vi.stubGlobal("fetch", fetchMock);
    render(<FeeAnalysisWorkspace account={null} network={null} />);

    analyse();

    const error = await screen.findByTestId("fee-error");
    expect(within(error).getByText(/connect a wallet/i)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows per-asset totals for each network", async () => {
    vi.stubGlobal("fetch", installServiceFetch([EVM_SUCCESS, EVM_BASE, STELLAR_LOCAL_FEE]));
    render(<FeeAnalysisWorkspace account={WALLET} network={null} />);

    analyse();

    const byNetwork = await screen.findByTestId("fee-by-network");
    expect(within(byNetwork).getByText(/ethereum · 1 charge/)).toBeTruthy();
    expect(within(byNetwork).getByText("0.00042")).toBeTruthy();
    expect(within(byNetwork).getByText("XLM")).toBeTruthy();
  });

  it("never renders a single total across two assets", async () => {
    vi.stubGlobal("fetch", installServiceFetch([EVM_SUCCESS, STELLAR_LOCAL_FEE]));
    render(<FeeAnalysisWorkspace account={WALLET} network={null} />);

    analyse();

    const notice = await screen.findByTestId("fiat-unavailable");
    expect(notice.textContent).toMatch(/more than one asset|no timestamped price/i);
  });

  it("shows a fiat figure only with the price and the time it was true", async () => {
    vi.stubGlobal("fetch", installServiceFetch([EVM_SUCCESS], { conversions: [ETH_PRICE] }));
    render(<FeeAnalysisWorkspace account={WALLET} network={null} />);

    analyse();

    const byNetwork = await screen.findByTestId("fee-by-network");
    expect(within(byNetwork).getByText("$0.84")).toBeTruthy();
    expect(within(byNetwork).getByText(/priced 2026-03-01/)).toBeTruthy();
    expect(screen.queryByTestId("fiat-unavailable")).toBeNull();
  });

  it("keeps a failed but charged transaction in the totals", async () => {
    vi.stubGlobal("fetch", installServiceFetch([EVM_FAILED]));
    render(<FeeAnalysisWorkspace account={WALLET} network={null} />);

    analyse();

    const byCategory = await screen.findByTestId("fee-by-category");
    expect(within(byCategory).getByText(/Approvals · 1 charge/)).toBeTruthy();
  });

  it("reports a replaced transaction as counted against its replacement", async () => {
    vi.stubGlobal("fetch", installServiceFetch([EVM_REPLACED, EVM_REPLACEMENT]));
    render(<FeeAnalysisWorkspace account={WALLET} network={null} />);

    analyse();

    const coverage = await screen.findByTestId("coverage-table");
    expect(within(coverage).getByText("Replaced")).toBeTruthy();
    expect(within(coverage).getByText(/counted as 0xaaa4/)).toBeTruthy();
  });

  it("lists a charge that exists but could not be read", async () => {
    vi.stubGlobal("fetch", installServiceFetch([EVM_SUCCESS, EVM_UNREADABLE]));
    render(<FeeAnalysisWorkspace account={WALLET} network={null} />);

    analyse();

    const coverage = await screen.findByTestId("coverage-table");
    expect(within(coverage).getByText(/could not be read/i)).toBeTruthy();

    const byNetwork = screen.getByTestId("fee-by-network");
    expect(within(byNetwork).getByText(/not readable, counted but not valued/i)).toBeTruthy();
  });

  it("says plainly when nothing is missing", async () => {
    vi.stubGlobal("fetch", installServiceFetch([EVM_SUCCESS]));
    render(<FeeAnalysisWorkspace account={WALLET} network={null} />);

    analyse();

    expect(await screen.findByTestId("coverage-complete")).toBeTruthy();
  });

  it("shows a fee-bump charge under the account that paid", async () => {
    vi.stubGlobal("fetch", installServiceFetch([STELLAR_FEE_BUMP]));
    render(<FeeAnalysisWorkspace account={WALLET} network={null} />);

    analyse();

    const summary = await screen.findByTestId("fee-summary");
    expect(within(summary).getByText(/complete coverage/i)).toBeTruthy();
  });

  it("renders a timeline row per period and asset", async () => {
    vi.stubGlobal("fetch", installServiceFetch([EVM_SUCCESS, EVM_FAILED]));
    render(<FeeAnalysisWorkspace account={WALLET} network={null} />);

    const timeline = await (async () => {
      analyse();
      return screen.findByTestId("cost-timeline");
    })();

    expect(within(timeline).getAllByText(/ETH · ethereum/).length).toBe(2);
  });

  it("surfaces an endpoint error with its code", async () => {
    vi.stubGlobal("fetch", async () => ({
      ok: false,
      status: 500,
      json: async () => ({ error: "fee_analysis_failed", message: "The provider did not respond." }),
    }));
    render(<FeeAnalysisWorkspace account={WALLET} network={null} />);

    analyse();

    const error = await screen.findByTestId("fee-error");
    expect(within(error).getByText(/fee_analysis_failed/)).toBeTruthy();
  });

  it("drops a late response once a newer period has been requested", async () => {
    const slow = installServiceFetch([EVM_SUCCESS, EVM_BASE, STELLAR_LOCAL_FEE], { delayMs: 40 });
    const fast = installServiceFetch([EVM_SUCCESS]);
    let useSlow = true;

    vi.stubGlobal("fetch", (url: string, init?: RequestInit) => (useSlow ? slow(url, init) : fast(url, init)));
    render(<FeeAnalysisWorkspace account={WALLET} network={null} />);

    analyse();
    useSlow = false;
    analyse();

    const byNetwork = await screen.findByTestId("fee-by-network");
    expect(within(byNetwork).queryByText("XLM")).toBeNull();

    await new Promise((resolve) => setTimeout(resolve, 80));

    await waitFor(() => {
      expect(within(screen.getByTestId("fee-by-network")).queryByText("XLM")).toBeNull();
    });
  });

  it("discards the report when the account changes", async () => {
    vi.stubGlobal("fetch", installServiceFetch([EVM_SUCCESS]));
    const view = render(<FeeAnalysisWorkspace account={WALLET} network={null} />);

    analyse();
    await screen.findByTestId("fee-summary");

    view.rerender(<FeeAnalysisWorkspace account="0x1111111111111111111111111111111111111111" network={null} />);

    expect(screen.queryByTestId("fee-summary")).toBeNull();
    expect(screen.getByTestId("fee-idle")).toBeTruthy();
  });
});
