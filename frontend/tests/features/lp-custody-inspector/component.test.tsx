import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LpCustodyInspector } from "@/components/research/lp-custody-inspector/LpCustodyInspector";
import { pool, wallet } from "./fixtures";

const walletMock = vi.hoisted(() => ({ address: "0x9999999999999999999999999999999999999999" }));
vi.mock("@/hooks/useWalletSession", () => ({ useWalletSession: () => ({ family: "evm", address: walletMock.address, isConnected: true }) }));

describe("LpCustodyInspector", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    walletMock.address = wallet;
  });

  it("exposes an accessible form, submits, and renders results by role/label rather than styling", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          network: "ethereum",
          poolAddress: pool,
          blockNumber: 100,
          state: "complete",
          model: "constant_product_v2",
          token0: null,
          token1: null,
          reserves: null,
          totalSupply: "1000",
          candidates: [{ address: pool, label: null, classification: "burned", balanceRaw: "400", basisPoints: 4000, lockClaim: { status: "not_claimed", unlockTimestamp: null, verified: false }, available: true }],
          summary: { burnedBasisPoints: 4000, claimedLockedBasisPoints: 0, otherIdentifiedBasisPoints: 0, unaccountedBasisPoints: 6000 },
          reorgDetected: false,
          warnings: ["Only burn addresses were checked: lock-contract coverage beyond that is unknown, not zero."],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    render(<LpCustodyInspector />);
    fireEvent.change(screen.getByLabelText("Pool address"), { target: { value: pool } });
    fireEvent.click(screen.getByRole("button", { name: "Read custody evidence" }));

    await waitFor(() => expect(screen.getByRole("table")).toBeTruthy());
    expect(screen.getByRole("columnheader", { name: "Classification" })).toBeTruthy();
    expect(screen.getByText(/Only burn addresses were checked/)).toBeTruthy();
  });

  it("shows an alert on failure and never renders a mutating action", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: "provider_unavailable", message: "Provider rate limited" }), { status: 503, headers: { "content-type": "application/json" } }));
    render(<LpCustodyInspector />);
    fireEvent.change(screen.getByLabelText("Pool address"), { target: { value: pool } });
    fireEvent.click(screen.getByRole("button", { name: "Read custody evidence" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Provider rate limited"));
    expect(screen.queryByRole("button", { name: /move|withdraw|transfer/i })).toBeNull();
  });
});
