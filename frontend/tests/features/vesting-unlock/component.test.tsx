import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VestingUnlockWorkbench } from "@/components/research/vesting-unlock/VestingUnlockWorkbench";
import { analyseVestingUnlocks } from "@/server/research/vesting-unlock/service";
import { VestingUnlockError } from "@/server/research/vesting-unlock/schema";
import { createTestReader, request } from "./fixtures";

function installServiceFetch(sourceId = "0xvesting-cliff") {
  return vi.fn(async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;

    try {
      const report = await analyseVestingUnlocks(
        {
          ...request({
            sources: [{ kind: "evm_vesting_contract", id: sourceId, network: "ethereum" }],
            displayTimeZone: typeof body.displayTimeZone === "string" ? body.displayTimeZone : "UTC",
          }),
        },
        createTestReader(),
      );

      return { ok: true, status: 200, json: async () => ({ report }) } as unknown as Response;
    } catch (error) {
      const failure = error as VestingUnlockError;

      return {
        ok: false,
        status: 400,
        json: async () => ({ error: failure.code ?? "vesting_unlock_failed", message: failure.message }),
      } as unknown as Response;
    }
  });
}

function analyse() {
  fireEvent.submit(screen.getByRole("form", { name: /vesting unlock sources/i }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("VestingUnlockWorkbench", () => {
  it("starts idle and promises no claim or schedule actions", () => {
    vi.stubGlobal("fetch", installServiceFetch());
    render(<VestingUnlockWorkbench network="ethereum" chainFamily="evm" />);

    expect(screen.getByTestId("vesting-idle").textContent).toMatch(/never claims|no claim/i);
    expect(screen.getByRole("button", { name: /analyse vesting unlocks/i })).toBeTruthy();
  });

  it("labels the source controls for assistive technology", () => {
    vi.stubGlobal("fetch", installServiceFetch());
    render(<VestingUnlockWorkbench network="ethereum" chainFamily="evm" />);

    expect(screen.getByLabelText(/source id/i)).toBeTruthy();
    expect(screen.getByLabelText(/display time zone/i)).toBeTruthy();
    expect(screen.getByRole("form", { name: /vesting unlock sources/i })).toBeTruthy();
  });

  it("renders distinct published-only and onchain labels with coverage", async () => {
    vi.stubGlobal("fetch", installServiceFetch("issuer-team-allocation"));
    render(<VestingUnlockWorkbench network="ethereum" chainFamily="evm" />);

    fireEvent.change(screen.getByLabelText(/source id/i), { target: { value: "issuer-team-allocation" } });
    analyse();

    const summary = await screen.findByTestId("vesting-summary");
    expect(within(summary).getAllByText(/published-only/i).length).toBeGreaterThan(0);
    expect(within(summary).getByTestId("vesting-coverage")).toBeTruthy();
    expect(within(summary).getByTestId("tranche-table")).toBeTruthy();
    expect(within(summary).getByTestId("unlock-timeline")).toBeTruthy();
  });

  it("announces errors assertively without claiming", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 500,
        json: async () => ({ error: "vesting_unlock_failed", message: "Provider offline" }),
      })),
    );
    render(<VestingUnlockWorkbench network="ethereum" chainFamily="evm" />);
    analyse();

    const error = await screen.findByTestId("vesting-error");
    expect(error.getAttribute("role")).toBe("alert");
    expect(error.textContent).toMatch(/provider offline/i);
    expect(screen.queryByRole("button", { name: /claim/i })).toBeNull();
  });

  it("drops a late response after the network session changes", async () => {
    let finish!: (response: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            finish = resolve;
          }),
      ),
    );

    const view = render(<VestingUnlockWorkbench network="ethereum" chainFamily="evm" />);
    analyse();

    view.rerender(<VestingUnlockWorkbench network="base" chainFamily="evm" />);

    const report = await analyseVestingUnlocks(request(), createTestReader());
    finish({ ok: true, status: 200, json: async () => ({ report }) } as Response);

    await waitFor(() => {
      expect(screen.queryByTestId("vesting-summary")).toBeNull();
    });
  });
});
