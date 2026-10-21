import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NetworkSettingsExplorer } from "@/components/research/network-settings/NetworkSettingsExplorer";
import { inspectNetworkSettings } from "@/server/research/network-settings";
import { readCurrentSettings } from "@/server/research/network-settings/settingsReader";
import { fixtureTransport, historyRecords } from "./fixtures";

function installFetch() {
  return vi.fn(async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { network: "testnet" | "futurenet" | "mainnet" };
    const report = await inspectNetworkSettings(
      { network: body.network },
      {
        reader: { read: (network) => readCurrentSettings(network, fixtureTransport(body.network), 1_000) },
        history: historyRecords,
      },
    );

    return { ok: true, status: 200, json: async () => ({ report }) } as unknown as Response;
  });
}

describe("network settings explorer", () => {
  it("renders the selector, table, timeline, diff, and coverage notice", async () => {
    vi.stubGlobal("fetch", installFetch());
    render(<NetworkSettingsExplorer />);

    expect(screen.getByLabelText("Network")).toBeTruthy();
    expect(await screen.findByRole("table", { name: "Current settings" })).toBeTruthy();
    expect(screen.getByRole("list", { name: "Upgrade timeline" })).toBeTruthy();
    expect(screen.getByRole("table", { name: "Snapshot diff" })).toBeTruthy();
    const coverage = screen.getByRole("region", { name: "Coverage" });
    expect(within(coverage).getByRole("status").textContent).toMatch(/setting/i);

    const settings = screen.getByRole("table", { name: "Current settings" });
    expect(within(settings).getByText("131072")).toBeTruthy();
    expect(within(settings).getAllByText("bytes").length).toBeGreaterThan(0);

    const timeline = screen.getByRole("list", { name: "Upgrade timeline" });
    expect(within(timeline).getByText("Ledger 1000")).toBeTruthy();
    expect(within(timeline).getByText(/Protocol 21/)).toBeTruthy();

    const diff = screen.getByRole("table", { name: "Snapshot diff" });
    expect(within(diff).getAllByText("Increase").length).toBeGreaterThan(0);
    expect(within(diff).getByText("Decrease")).toBeTruthy();
    expect(within(diff).queryByText("580000000")).toBeNull();
  });

  it("drops the previous network when the selector changes", async () => {
    vi.stubGlobal("fetch", installFetch());
    render(<NetworkSettingsExplorer />);
    await screen.findAllByText("131072");

    fireEvent.change(screen.getByLabelText("Network"), { target: { value: "mainnet" } });

    await waitFor(() => {
      const settings = screen.getByRole("table", { name: "Current settings" });
      expect(within(settings).queryByText("131072")).toBeNull();
      expect(within(settings).getByText("65536")).toBeTruthy();
    });
    expect(screen.getByText("Ledger 999999")).toBeTruthy();
  });

  it("stays within a 390px layout", async () => {
    window.innerWidth = 390;
    vi.stubGlobal("fetch", installFetch());
    render(<NetworkSettingsExplorer />);
    await screen.findByRole("table", { name: "Current settings" });

    const root = screen.getByTestId("network-settings-explorer");
    expect(root.className).toMatch(/max-w-full/);
    expect(root.className).toMatch(/min-w-0/);
    expect(root.className).toMatch(/px-3/);
    expect(root.className).toMatch(/flex-col/);

    const table = screen.getByRole("table", { name: "Current settings" });
    expect(table.parentElement?.className).toMatch(/overflow-x-auto/);
    expect(window.innerWidth).toBe(390);
  });
});
