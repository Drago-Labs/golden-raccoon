import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PoolHistory } from "@/components/research/soroban-pool-history/PoolHistory";
import { reconstructPoolHistory } from "@/server/research/soroban-pool-history/service";
import { consistentFixture, depsFor, requestFor, unavailableDeps, unknownLayoutFixture } from "./fixtures";

afterEach(() => {
  vi.unstubAllGlobals();
});

function install(report: Promise<unknown>) {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ report: await report }) })));
}

function submit(poolId: string) {
  fireEvent.change(screen.getByRole("textbox", { name: /^pool contract$/i }), { target: { value: poolId } });
  fireEvent.submit(screen.getByRole("form", { name: /soroban pool history/i }));
}

describe("PoolHistory", () => {
  it("states that it does not trade or predict prices", () => {
    vi.stubGlobal("fetch", vi.fn());
    render(<PoolHistory />);
    expect(screen.getByTestId("pool-history-idle").textContent).toMatch(/does not trade/i);
    expect(screen.getByRole("spinbutton", { name: /^from ledger$/i })).toBeTruthy();
  });

  it("shows a reserve chart text alternative and linked large trades", async () => {
    install(reconstructPoolHistory(requestFor(consistentFixture), depsFor(consistentFixture)));
    render(<PoolHistory />);
    submit(consistentFixture.pool_id);
    expect((await screen.findByTestId("reserve-chart")).textContent).toMatch(/Ledger 10/);
    expect(screen.getByTestId("large-trade-list").textContent).toMatch(/Transaction/);
    expect(screen.getByTestId("drift-notice").textContent).toMatch(/match/i);
  });

  it("shows an unsupported layout notice", async () => {
    install(reconstructPoolHistory(requestFor(unknownLayoutFixture), depsFor(unknownLayoutFixture)));
    render(<PoolHistory />);
    submit(unknownLayoutFixture.pool_id);
    expect((await screen.findByTestId("coverage-notice")).textContent).toMatch(/unsupported/i);
  });

  it("shows an unavailable provider notice", async () => {
    install(reconstructPoolHistory(requestFor(consistentFixture), unavailableDeps()));
    render(<PoolHistory />);
    submit(consistentFixture.pool_id);
    expect((await screen.findByTestId("coverage-notice")).textContent).toMatch(/unavailable/i);
  });

  it("drops the report when the network changes and announces errors", async () => {
    install(reconstructPoolHistory(requestFor(consistentFixture), depsFor(consistentFixture)));
    render(<PoolHistory />);
    submit(consistentFixture.pool_id);
    await screen.findByTestId("reserve-chart");
    fireEvent.change(screen.getByRole("combobox", { name: /^network$/i }), { target: { value: "stellar-pubnet" } });
    await waitFor(() => expect(screen.queryByTestId("reserve-chart")).toBeNull());

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 400,
        json: async () => ({ error: "invalid_request", message: "The pool history request is invalid." }),
      })),
    );
    fireEvent.change(screen.getByRole("combobox", { name: /^network$/i }), { target: { value: "stellar-testnet" } });
    submit(consistentFixture.pool_id);
    expect((await screen.findByRole("alert")).textContent).toMatch(/invalid/i);
  });
});
