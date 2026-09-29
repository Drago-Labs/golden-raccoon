import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PreflightPanel } from "@/components/research/execution-preflight/PreflightPanel";
import { PreflightError } from "@/server/research/execution-preflight/schema";
import { analysePreflight } from "@/server/research/execution-preflight/service";
import { staleSimulation, stellarComplete } from "./fixtures";

function installServiceFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      try {
        const report = analysePreflight(JSON.parse(String(init?.body ?? "{}")));
        return { ok: true, status: 200, json: async () => ({ report }) } as unknown as Response;
      } catch (error) {
        const failure = error as PreflightError;
        return {
          ok: false,
          status: 400,
          json: async () => ({ error: failure.code, message: failure.message }),
        } as unknown as Response;
      }
    }),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("PreflightPanel", () => {
  it("shows idle state", () => {
    installServiceFetch();
    render(<PreflightPanel account="0x1" network="stellar-pubnet" />);
    expect(screen.getByText(/No prepared plan is loaded/i)).toBeTruthy();
  });

  it("renders budget table with keyboard-reachable caption and never-signs marker", async () => {
    installServiceFetch();
    render(<PreflightPanel input={stellarComplete} account="GABC" network="stellar-pubnet" />);

    const table = await screen.findByRole("table", { name: /Preflight budget/i });
    expect(within(table).getByText(/Stellar base fee/i)).toBeTruthy();
    expect(within(table).getByText(/Stellar resource fee/i)).toBeTruthy();
    expect(screen.getByTestId("never-signs").textContent).toMatch(/yes/i);
    expect(screen.getByTestId("coverage-note").textContent).toMatch(/complete/i);
  });

  it("shows blockers when simulation is stale", async () => {
    installServiceFetch();
    render(<PreflightPanel input={staleSimulation} account="GABC" network="stellar-pubnet" />);
    const blockers = await screen.findByTestId("blockers");
    expect(within(blockers).getByText(/stale simulation/i)).toBeTruthy();
    expect(screen.getByTestId("coverage-note").textContent).toMatch(/Safe to present as complete: no/i);
  });

  it("announces errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 400,
        json: async () => ({ error: "invalid_request", message: "bad" }),
      })),
    );
    render(
      <PreflightPanel
        input={{ observedAt: "x", preparedPlan: {}, simulation: {} }}
        account="GABC"
        network="stellar-pubnet"
      />,
    );
    expect(await screen.findByRole("alert")).toBeTruthy();
  });
});
