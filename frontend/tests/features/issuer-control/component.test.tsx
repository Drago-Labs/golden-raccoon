import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IssuerControlInspector } from "@/components/research/issuer-control/IssuerControlInspector";
import { issuer, wallet } from "./fixtures";

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
  asset: {
    kind: "classic",
    assetKey: `classic:USD:${issuer}`,
    display: `USD:${issuer}`,
    code: "USD",
    issuer,
    contractId: null,
    network: "stellar-testnet",
  },
  observation: { ledger: 100, closeTime: "2026-01-01T00:00:00Z", source: "horizon.example" },
  issuerFlags: {
    state: "observed",
    authRequired: true,
    authRevocable: true,
    authImmutable: false,
    authClawbackEnabled: true,
    issuerExists: true,
    issuer,
    ledger: 100,
    observedAt: "2026-01-01T00:00:00Z",
    source: "horizon.example",
    note: "Issuer control flags recorded at the observed ledger.",
  },
  trustline: {
    state: "fully_authorized",
    balance: "10.0000000",
    limit: "1000.0000000",
    buyingLiabilities: "0",
    sellingLiabilities: "0",
    account: wallet,
    assetKey: `classic:USD:${issuer}`,
    ledger: 100,
    observedAt: "2026-01-01T00:00:00Z",
    source: "horizon.example",
    note: "Trustline is fully authorized at the observed ledger.",
  },
  events: [
    {
      id: "effect-1",
      kind: "trustline_clawed_back",
      pagingToken: "1",
      account: wallet,
      assetKey: `classic:USD:${issuer}`,
      amount: "1.0000000",
      ledger: 99,
      closedAt: "2025-12-31T00:00:00Z",
      source: "horizon.example",
      note: "Observed trustline clawed back effect.",
    },
  ],
  coverage: {
    pagesRead: 1,
    recordsRead: 1,
    duplicatePage: false,
    truncated: false,
    message: "Issuer-control evidence is incomplete or partially unavailable.",
  },
  warnings: ["Event window is illustrative"],
};

describe("IssuerControlInspector", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    current.address = wallet;
  });

  it("renders controls, trustline state, and event details", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } }),
    );
    render(<IssuerControlInspector />);
    fireEvent.change(screen.getByLabelText(/Asset/i), {
      target: { value: `USD:${issuer}` },
    });
    fireEvent.click(screen.getByRole("button", { name: "Inspect issuer controls" }));
    await waitFor(() => expect(screen.getByText("fully_authorized")).toBeTruthy());
    expect(screen.getByText("auth_clawback_enabled")).toBeTruthy();
    expect(screen.getByText("Observed trustline clawed back effect.")).toBeTruthy();
  });

  it("supports keyboard focus on event rows", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } }),
    );
    render(<IssuerControlInspector />);
    fireEvent.change(screen.getByLabelText(/Asset/i), { target: { value: `USD:${issuer}` } });
    fireEvent.click(screen.getByRole("button", { name: "Inspect issuer controls" }));
    await waitFor(() => expect(screen.getByLabelText("Issuer control events")).toBeTruthy());
    const row = screen.getByLabelText("Issuer control events").querySelector("li");
    expect(row).toBeTruthy();
    row?.focus();
    expect(document.activeElement).toBe(row);
  });
});
