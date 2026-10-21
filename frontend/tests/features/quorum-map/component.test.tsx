import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QuorumExplorer } from "@/components/research/quorum-map/QuorumExplorer";
import { mapQuorum } from "@/server/research/quorum-map/service";
import { depsFor, mainnetFixture, mismatchFixture, nestedFixture, NOW, unavailableDeps } from "./fixtures";

afterEach(() => {
  vi.unstubAllGlobals();
});

function install(report: Promise<unknown>) {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ report: await report }) })));
}

function load() {
  fireEvent.submit(screen.getByRole("form", { name: /quorum map/i }));
}

describe("QuorumExplorer", () => {
  it("says it does not prove network safety before loading", () => {
    vi.stubGlobal("fetch", vi.fn());
    render(<QuorumExplorer />);
    expect(screen.getByTestId("quorum-idle").textContent).toMatch(/does not prove network safety/i);
    expect(screen.getByRole("combobox", { name: /^network$/i })).toBeTruthy();
  });

  it("shows organization dependence and does not claim the network is safe", async () => {
    install(mapQuorum({ network: "stellar-pubnet" }, depsFor(mainnetFixture), NOW));
    render(<QuorumExplorer initialNetwork="stellar-pubnet" />);
    load();
    const coverage = await screen.findByTestId("coverage-notice");
    expect(coverage.textContent).toMatch(/does not prove quorum intersection or network safety/);
    expect(coverage.textContent).not.toMatch(/network is safe/i);
    expect(screen.getByTestId("organization-table").textContent).toMatch(/Alpha/);
    expect(screen.getByTestId("dependency-panel").textContent).toMatch(/breaks/);
  });

  it("shows an unresolved key and a stale toml mismatch", async () => {
    install(mapQuorum({ network: "stellar-testnet" }, depsFor(nestedFixture), NOW));
    render(<QuorumExplorer />);
    load();
    expect((await screen.findByTestId("unresolved-keys")).textContent).toMatch(/Unresolved keys/);

    install(mapQuorum({ network: "stellar-testnet" }, depsFor(mismatchFixture), NOW));
    load();
    expect((await screen.findByTestId("toml-disagreements")).textContent).toMatch(/other.example/);
    expect(screen.getByTestId("dependency-panel").textContent).toMatch(/seconds old/);
  });

  it("shows an unavailable source and drops the report when the network changes", async () => {
    install(mapQuorum({ network: "stellar-testnet" }, unavailableDeps(), NOW));
    render(<QuorumExplorer />);
    load();
    const coverage = await screen.findByTestId("coverage-notice");
    expect(coverage.textContent).toMatch(/unavailable/i);
    expect(screen.queryByTestId("organization-table")).toBeNull();

    install(mapQuorum({ network: "stellar-pubnet" }, depsFor(mainnetFixture), NOW));
    fireEvent.change(screen.getByRole("combobox", { name: /^network$/i }), { target: { value: "stellar-pubnet" } });
    await waitFor(() => expect(screen.queryByTestId("coverage-notice")).toBeNull());
    load();
    await screen.findByTestId("organization-table");
    fireEvent.change(screen.getByRole("combobox", { name: /^network$/i }), { target: { value: "stellar-testnet" } });
    await waitFor(() => expect(screen.queryByTestId("organization-table")).toBeNull());
  });
});
