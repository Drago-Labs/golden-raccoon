import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PathPaymentInspector } from "@/components/research/path-payment/PathPaymentInspector";
import { issuerA, issuerB, wallet } from "./fixtures";

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
  mode: "strict_send",
  state: "partial",
  generatedAt: "now",
  observation: { ledger: 300, closeTime: "2026-01-03T00:00:00Z", source: "horizon.example", quoteAgeSeconds: 5 },
  sourceAssetKey: "native",
  destinationAssetKey: `classic:USD:${issuerA}`,
  routes: [
    {
      id: "route-1",
      hops: [
        {
          index: 0,
          fromAssetKey: "native",
          toAssetKey: `classic:USD:${issuerB}`,
          inputAmount: "1.0000000",
          outputAmount: "—",
          venue: "orderbook",
          note: "hop",
        },
        {
          index: 1,
          fromAssetKey: `classic:USD:${issuerB}`,
          toAssetKey: `classic:USD:${issuerA}`,
          inputAmount: "—",
          outputAmount: "2.5000000",
          venue: "pool",
          note: "hop",
        },
      ],
      sourceAmount: "1.0000000",
      destinationAmount: "2.5000000",
      estimated: true,
      simulated: false,
      failure: "incomplete_simulation",
      warnings: ["Estimate only"],
    },
  ],
  primaryFailure: "incomplete_simulation",
  coverageMessage: "Path estimates available with explicit freshness/simulation limits.",
  warnings: ["Routes are estimates without a completed simulation."],
};

describe("PathPaymentInspector", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    current.address = wallet;
  });

  it("renders hop table and keyboard-focusable routes", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } }),
    );
    render(<PathPaymentInspector />);
    fireEvent.change(screen.getByLabelText(/Destination asset/i), {
      target: { value: `USD:${issuerA}` },
    });
    fireEvent.click(screen.getByRole("button", { name: "Inspect path routes" }));
    await waitFor(() => expect(screen.getByText(/Path estimates available/i)).toBeTruthy());
    expect(screen.getByLabelText("Path payment routes")).toBeTruthy();
    const row = screen.getByLabelText("Path payment routes").querySelector("li");
    row?.focus();
    expect(document.activeElement).toBe(row);
  });
});
