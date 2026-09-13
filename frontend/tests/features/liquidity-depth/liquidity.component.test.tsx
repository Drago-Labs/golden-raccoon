import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LiquidityWorkbench } from "@/components/research/liquidity-depth/LiquidityWorkbench";
import { LiquidityError } from "@/server/research/liquidity-depth/schema";
import { analyseLiquidity } from "@/server/research/liquidity-depth/service";
import { constantProductFeeAndRounding, emptyBook, orderbookMultipleLevels, staleTruncatedUnsupported } from "./fixtures";

function installServiceFetch(options: { delayMs?: number } = {}) {
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    if (options.delayMs) await new Promise((resolve) => setTimeout(resolve, options.delayMs));

    try {
      const report = analyseLiquidity(JSON.parse(String(init?.body ?? "{}")));
      return { ok: true, status: 200, json: async () => ({ report }) } as unknown as Response;
    } catch (error) {
      const failure = error as LiquidityError;
      return { ok: false, status: 400, json: async () => ({ error: failure.code, message: failure.message }) } as unknown as Response;
    }
  });

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("LiquidityWorkbench", () => {
  it("shows an explicit empty state with no snapshot", () => {
    installServiceFetch();
    render(<LiquidityWorkbench account="0xabc" network="ethereum" />);

    expect(screen.getByText(/No venue snapshot is loaded/i)).toBeTruthy();
  });

  it("renders the ladder at the asset's own scale", async () => {
    installServiceFetch();
    render(<LiquidityWorkbench input={orderbookMultipleLevels} account="0xabc" network="stellar-pubnet" />);

    // 1_500_000_000 base units at 7 decimals is 150 XLM, and its 745_000_000
    // quote base units at 7 decimals is 74.5 USDC.
    const ladder = await screen.findByRole("table", { name: /Capacity by trade size/i });
    const row = within(ladder).getByRole("rowheader", { name: "150" }).closest("tr")!;
    expect(within(row).getByText("74.5")).toBeTruthy();
  });

  it("carries the informational-only notice", async () => {
    installServiceFetch();
    render(<LiquidityWorkbench input={orderbookMultipleLevels} account="0xabc" network="stellar-pubnet" />);

    const notice = await screen.findByTestId("informational-notice");
    expect(within(notice).getByText(/never creates an executable quote/i)).toBeTruthy();
  });

  it("shows a size beyond the book as partly visible", async () => {
    installServiceFetch();
    render(<LiquidityWorkbench input={orderbookMultipleLevels} account="0xabc" network="stellar-pubnet" />);

    await screen.findByRole("table", { name: /Capacity by trade size/i });
    expect(screen.getByText(/Partly visible/i)).toBeTruthy();
  });

  it("labels pool figures as modelled", async () => {
    installServiceFetch();
    render(<LiquidityWorkbench input={constantProductFeeAndRounding} account="0xabc" network="ethereum" />);

    await screen.findAllByText(/Uniswap V2 WETH\/USDC/);
    expect(screen.getAllByText(/model of the curve, not an observed order/i).length).toBeGreaterThan(0);
  });

  it("surfaces the reason a venue's figures are qualified", async () => {
    installServiceFetch();
    render(<LiquidityWorkbench input={staleTruncatedUnsupported} account="0xabc" network="stellar-pubnet" />);

    const qualifications = await screen.findByTestId("venue-qualifications");
    expect(within(qualifications).getByText(/freshness bound/i)).toBeTruthy();
    expect(within(qualifications).getByText(/unknown, not absent/i)).toBeTruthy();
  });

  it("switches between venues", async () => {
    installServiceFetch();
    render(<LiquidityWorkbench input={staleTruncatedUnsupported} account="0xabc" network="stellar-pubnet" />);

    await screen.findByRole("radio", { name: /Exotic concentrated AMM/i });
    fireEvent.click(screen.getByRole("radio", { name: /Exotic concentrated AMM/i }));

    await waitFor(() => expect(screen.getAllByText(/Not modelled/i).length).toBeGreaterThan(0));
  });

  it("reports an empty taker side without claiming zero-cost depth", async () => {
    installServiceFetch();
    render(<LiquidityWorkbench input={emptyBook} account="0xabc" network="stellar-pubnet" />);

    await screen.findByText(/No visible depth/i);
    expect(screen.getAllByText("Not derivable").length).toBeGreaterThan(0);
  });

  it("surfaces a failure without partial output", async () => {
    installServiceFetch();
    render(
      <LiquidityWorkbench
        input={{ ...orderbookMultipleLevels, ladder: ["100", "100"] }}
        account="0xabc"
        network="stellar-pubnet"
      />,
    );

    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText(/could not be analysed/i)).toBeTruthy();
    expect(screen.queryByTestId("informational-notice")).toBeNull();
  });

  it("drops a rendered report when the wallet session changes", async () => {
    installServiceFetch();
    const { rerender } = render(
      <LiquidityWorkbench input={orderbookMultipleLevels} account="0xabc" network="stellar-pubnet" />,
    );

    await screen.findByRole("table", { name: /Capacity by trade size/i });

    rerender(<LiquidityWorkbench account="0xdifferent" network="stellar-pubnet" />);

    await waitFor(() => expect(screen.queryByRole("table", { name: /Capacity by trade size/i })).toBeNull());
    expect(screen.getByText(/No venue snapshot is loaded/i)).toBeTruthy();
  });

  it("discards a response that resolves after the session moved on", async () => {
    installServiceFetch({ delayMs: 40 });
    const { rerender } = render(
      <LiquidityWorkbench input={orderbookMultipleLevels} account="0xabc" network="stellar-pubnet" />,
    );

    rerender(<LiquidityWorkbench account="0xdifferent" network="stellar-pubnet" />);

    await new Promise((resolve) => setTimeout(resolve, 120));

    expect(screen.queryByRole("table", { name: /Capacity by trade size/i })).toBeNull();
    expect(screen.getByText(/No venue snapshot is loaded/i)).toBeTruthy();
  });
});
