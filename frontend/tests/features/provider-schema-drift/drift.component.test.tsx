import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProviderDriftPanel } from "@/components/research/provider-schema-drift/ProviderDriftPanel";
import { DriftError } from "@/server/research/provider-schema-drift/schema";
import { analyseProviderDrift } from "@/server/research/provider-schema-drift/service";
import { unitShiftedStellar, unavailableProbe } from "./fixtures";

function installServiceFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      try {
        const report = analyseProviderDrift(JSON.parse(String(init?.body ?? "{}")));
        return { ok: true, status: 200, json: async () => ({ report }) } as unknown as Response;
      } catch (error) {
        const failure = error as DriftError;
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

describe("ProviderDriftPanel", () => {
  it("shows idle state", () => {
    installServiceFetch();
    render(<ProviderDriftPanel />);
    expect(screen.getByText(/No probe suite loaded/i)).toBeTruthy();
  });

  it("lists unit-shift findings", async () => {
    installServiceFetch();
    render(<ProviderDriftPanel input={unitShiftedStellar} />);
    const findings = await screen.findByTestId("findings");
    expect(within(findings).getAllByText(/breaking/i).length).toBeGreaterThan(0);
    expect(within(findings).getByText(/Unit shifted/i)).toBeTruthy();
  });

  it("shows unavailable probes as failed contracts", async () => {
    installServiceFetch();
    render(<ProviderDriftPanel input={unavailableProbe} />);
    const findings = await screen.findByTestId("findings");
    expect(within(findings).getAllByText(/unavailable/i).length).toBeGreaterThan(0);
  });

  it("announces authorization failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 401,
        json: async () => ({ error: "operator_unauthorized" }),
      })),
    );
    render(<ProviderDriftPanel input={unitShiftedStellar} />);
    expect(await screen.findByRole("alert")).toBeTruthy();
  });
});
