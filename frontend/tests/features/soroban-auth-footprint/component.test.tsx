import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SorobanAuthFootprintInspector } from "@/components/research/soroban-auth-footprint/SorobanAuthFootprintInspector";
import { nestedSimulation, wallet } from "./fixtures";

const current = vi.hoisted(() => ({
  address: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
}));

vi.mock("@/hooks/useWalletSession", () => ({
  useWalletSession: () => ({
    family: "stellar",
    address: current.address,
    isConnected: true,
    stellar: { network: "stellar-testnet" },
  }),
}));

const payload = {
  walletAddress: wallet,
  network: "stellar-testnet",
  state: "partial",
  generatedAt: "now",
  decodingIsNotApproval: true,
  nodes: [
    {
      id: "auth-1",
      parentId: null,
      address: wallet,
      contractId: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFCT4",
      functionName: "transfer",
      argumentHash: "abc",
      nonce: "1",
      expirationLedger: 500,
      networkPassphrase: "Test SDF Network ; September 2015",
      depth: 0,
      flags: [],
      note: "Auth entry decoded from simulation fixture.",
    },
    {
      id: "auth-2",
      parentId: "auth-1",
      address: wallet,
      contractId: "CBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHBQ",
      functionName: "approve",
      argumentHash: "def",
      nonce: "2",
      expirationLedger: 500,
      networkPassphrase: "Test SDF Network ; September 2015",
      depth: 1,
      flags: [],
      note: "Auth entry decoded from simulation fixture.",
    },
  ],
  warnings: [],
  coverageMessage: "Authorization tree decoded with explicit flags; decoding is not approval.",
};

describe("SorobanAuthFootprintInspector", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    current.address = wallet;
  });

  it("renders nested auth nodes and supports keyboard focus", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } }),
    );
    render(<SorobanAuthFootprintInspector />);
    fireEvent.change(screen.getByLabelText(/Simulation JSON/i), { target: { value: nestedSimulation } });
    fireEvent.click(screen.getByRole("button", { name: "Inspect authorization footprint" }));
    await waitFor(() => expect(screen.getByText(/decoding is not approval/i)).toBeTruthy());
    expect(screen.getByText(/parent auth-1/i)).toBeTruthy();
    const row = screen.getByLabelText("Soroban authorization nodes").querySelector("li");
    row?.focus();
    expect(document.activeElement).toBe(row);
  });
});
