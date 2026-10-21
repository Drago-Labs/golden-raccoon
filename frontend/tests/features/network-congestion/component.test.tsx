import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CongestionWorkbench } from "@/components/research/network-congestion/CongestionWorkbench";
import { NetworkCongestionError } from "@/server/research/network-congestion/errors";
import { explainCongestion } from "@/server/research/network-congestion/service";
import { createRecordedReader, gapWindow, providerUnavailable, quietWindow, surgeWindow, type RecordedWindow } from "./fixtures";

function installFetch(recorded: RecordedWindow) {
  return vi.fn(async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}"));

    try {
      const report = await explainCongestion(body, createRecordedReader(recorded));

      return { ok: true, status: 200, json: async () => ({ report }) } as unknown as Response;
    } catch (error) {
      const failure = error as NetworkCongestionError;

      return {
        ok: false,
        status: 400,
        json: async () => ({ error: failure.code, message: failure.message }),
      } as unknown as Response;
    }
  });
}

function show(from: string, to: string) {
  fireEvent.change(screen.getByLabelText("From ledger"), { target: { value: from } });
  fireEvent.change(screen.getByLabelText("To ledger"), { target: { value: to } });
  fireEvent.click(screen.getByRole("button", { name: /show conditions/i }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CongestionWorkbench", () => {
  it("labels the window and explains the idle state", () => {
    vi.stubGlobal("fetch", installFetch(quietWindow));
    render(<CongestionWorkbench />);

    expect(screen.getByRole("form", { name: "Network congestion window" })).toBeTruthy();
    expect(screen.getByLabelText("Network")).toBeTruthy();
    expect(screen.getByLabelText("Window")).toBeTruthy();
    expect(screen.getByLabelText("From ledger")).toBeTruthy();
    expect(screen.getByLabelText("To ledger")).toBeTruthy();
    expect(screen.getByTestId("congestion-idle").textContent).toMatch(/classic inclusion fees and soroban resource fees stay separate/i);
  });

  it("does not request a window until both ledgers are entered", () => {
    const fetchMock = installFetch(quietWindow);
    vi.stubGlobal("fetch", fetchMock);
    render(<CongestionWorkbench />);

    fireEvent.click(screen.getByRole("button", { name: /show conditions/i }));

    expect(screen.getByRole("alert").textContent).toMatch(/both ledger sequences/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("renders capacity, an empty surge list, separate fee tables, and coverage for a quiet window", async () => {
    vi.stubGlobal("fetch", installFetch(quietWindow));
    render(<CongestionWorkbench />);

    show("100", "102");

    expect(await screen.findByRole("heading", { name: "Capacity" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Surge periods" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Fee percentiles" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Coverage" })).toBeTruthy();
    expect(screen.getByTestId("surge-empty")).toBeTruthy();
    expect(screen.getByTestId("fee-classic").textContent).toContain("100 stroops/op");
    expect(screen.getByTestId("fee-soroban-resource").textContent).toContain("5000 stroops");
    expect(screen.getByTestId("fee-soroban-resource").textContent).not.toContain("5100");
    expect(screen.getByTestId("coverage-notice").textContent).toMatch(/never added together/i);
    expect(screen.getByTestId("capacity-chart").innerHTML).toContain("overflow-x-auto");
    expect(screen.getByTestId("fee-classic").className).toContain("overflow-x-auto");
  });

  it("lists the surge run and keeps the resource fee out of the inclusion floor", async () => {
    vi.stubGlobal("fetch", installFetch(surgeWindow));
    render(<CongestionWorkbench />);

    show("200", "202");

    const list = await screen.findByTestId("surge-list");

    expect(list.className).toContain("grid-cols-1");
    expect(list.textContent).toContain("Ledgers 200–202");
    expect(list.textContent).toContain("200 stroops/op");
    expect(list.textContent).toContain("1000 stroops/op");
    expect(list.textContent).toMatch(/not part of either floor/i);
    expect(screen.getByTestId("fee-classic").textContent).toContain("400 stroops/op");
    expect(screen.getByTestId("fee-soroban-resource").textContent).toContain("3000 stroops");
  });

  it("shows the missing ledger and says it is excluded", async () => {
    vi.stubGlobal("fetch", installFetch(gapWindow));
    render(<CongestionWorkbench />);

    show("300", "304");

    const gap = await screen.findByTestId("capacity-gap");

    expect(gap.textContent).toContain("302");
    expect(gap.textContent).toMatch(/excluded from statistics/i);
    expect(screen.getByTestId("coverage-notice").textContent).toMatch(/partial/i);
  });

  it("shows provider unavailability without a fee table", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 503,
        json: async () => providerUnavailable.error,
      })),
    );
    render(<CongestionWorkbench />);

    show("10", "12");

    const notice = await screen.findByTestId("coverage-notice");

    expect(notice.textContent).toContain(providerUnavailable.error.message);
    expect(notice.textContent).toMatch(/no capacity figure/i);
    expect(screen.queryByRole("heading", { name: "Fee percentiles" })).toBeNull();
  });
});
