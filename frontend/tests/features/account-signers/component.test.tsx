import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountSignersWorkbench } from "@/components/research/account-signers/AccountSignersWorkbench";
import { coSigner, wallet } from "./fixtures";

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
  accountAddress: wallet,
  network: "stellar-testnet",
  state: "partial",
  generatedAt: "now",
  observation: { ledger: 200, closeTime: "2026-01-02T00:00:00Z", source: "horizon.example" },
  thresholds: { low: 1, medium: 2, high: 3, masterWeight: 0 },
  signers: [
    { key: wallet, weight: 0, kind: "ed25519", sponsor: null },
    { key: coSigner, weight: 2, kind: "ed25519", sponsor: coSigner },
  ],
  totalWeight: 2,
  operations: [
    {
      operation: "payment",
      band: "medium",
      requiredWeight: 2,
      reachable: true,
      note: "Observed signer weights (2) meet the medium threshold (2). This does not prove key possession.",
    },
  ],
  sorobanAuthorization: {
    state: "unsupported",
    note: "Soroban contract authorization is contract-specific and is not modeled as classic threshold reachability.",
  },
  warnings: ["Master key weight is zero; authorization depends on additional signers."],
  coverageMessage: "Signer policy observed with explicit caveats; reachability is not key possession.",
};

describe("AccountSignersWorkbench", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    current.address = wallet;
  });

  it("renders signer table and operation matrix", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } }),
    );
    render(<AccountSignersWorkbench />);
    fireEvent.click(screen.getByRole("button", { name: "Inspect signer policy" }));
    await waitFor(() => expect(screen.getByText(/· reachable/)).toBeTruthy());
    expect(screen.getByLabelText("Account signers")).toBeTruthy();
    expect(screen.getByText(/does not prove key possession/i)).toBeTruthy();
  });

  it("supports keyboard focus on signer rows", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } }),
    );
    render(<AccountSignersWorkbench />);
    fireEvent.click(screen.getByRole("button", { name: "Inspect signer policy" }));
    await waitFor(() => expect(screen.getByLabelText("Account signers")).toBeTruthy());
    const row = screen.getByLabelText("Account signers").querySelector("tbody tr");
    row?.focus();
    expect(document.activeElement).toBe(row);
  });
});
