import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AllowanceInventory } from "@/components/research/allowance-inventory/AllowanceInventory";
import { walletA, walletB } from "./fixtures";

const walletMock = vi.hoisted(() => ({ address: "0x1111111111111111111111111111111111111111" }));
vi.mock("@/hooks/useWalletSession", () => ({ useWalletSession: () => ({ family: "evm", address: walletMock.address, isConnected: true }) }));

describe("AllowanceInventory", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    walletMock.address = walletA;
  });

  it("renders loading, complete coverage and revoked current state", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      walletAddress: walletA,
      network: "ethereum",
      generatedAt: "2026-01-01T00:00:00Z",
      state: "complete",
      entries: [],
      spenderGroups: [],
      coverage: { state: "complete", fromBlock: "0", toBlock: "1000", snapshotBlock: "1000", candidateCount: 0, successfulReads: 0, skippedCalls: 0, logCoverageComplete: true, reorgDetected: false, providerLimitations: [], unsupportedStandards: [], message: "Bounded scan complete." },
    }), { status: 200, headers: { "content-type": "application/json" } }));
    render(<AllowanceInventory />);
    fireEvent.click(screen.getByRole("button", { name: "Build read-only inventory" }));
    expect(screen.getByText("Reading snapshot…")).toBeTruthy();
    await waitFor(() => expect(screen.getByText("Bounded scan complete.")).toBeTruthy());
    expect(screen.getByText(/No candidates were found/)).toBeTruthy();
  });

  it("shows explicit failures and exposes no mutation control", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: "inventory_unavailable", message: "Provider rate limited" }), { status: 503, headers: { "content-type": "application/json" } }));
    render(<AllowanceInventory />);
    fireEvent.click(screen.getByRole("button", { name: "Build read-only inventory" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Provider rate limited"));
    expect(screen.queryByRole("button", { name: /approve|revoke|submit/i })).toBeNull();
  });

  it("does not restore a late result after the connected wallet changes", async () => {
    let resolveRequest!: (value: Response) => void;
    vi.spyOn(globalThis, "fetch").mockReturnValue(new Promise((resolve) => { resolveRequest = resolve; }));
    const view = render(<AllowanceInventory />);
    fireEvent.click(screen.getByRole("button", { name: "Build read-only inventory" }));
    walletMock.address = walletB;
    view.rerender(<AllowanceInventory />);
    resolveRequest(new Response(JSON.stringify({ walletAddress: walletA, network: "ethereum", state: "complete", entries: [], spenderGroups: [], coverage: { state: "complete", message: "Old wallet result" } }), { status: 200, headers: { "content-type": "application/json" } }));
    await Promise.resolve();
    await Promise.resolve();
    expect(screen.queryByText("Old wallet result")).toBeNull();
  });
});
