import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReservePlanner } from "@/components/research/reserve-planner/ReservePlanner";
import { stellarWallet } from "./fixtures";

const wallet = vi.hoisted(() => ({ address: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5", network: "stellar-testnet" as "stellar-testnet" | "stellar-pubnet" }));
vi.mock("@/hooks/useWalletSession", () => ({ useWalletSession: () => ({ family: "stellar", address: wallet.address, isConnected: true, stellar: { network: wallet.network } }) }));

const complete = { walletAddress: stellarWallet, network: "stellar-testnet", state: "complete", generatedAt: "now", observation: { ledger: 900, source: "horizon", checkedAt: "now", consistent: true }, baseReserveStroops: "5000000", beforeCounters: { subentryCount: 2, numSponsoring: 0, numSponsored: 0 }, afterCounters: { subentryCount: 3, numSponsoring: 0, numSponsored: 0 }, before: { balanceStroops: "1000000000", baseAccountReserveStroops: "10000000", subentryReserveStroops: "10000000", sponsoringReserveStroops: "0", sponsoredReserveCreditStroops: "0", minimumReserveStroops: "20000000", sellingLiabilitiesStroops: "12500000", feeAllowanceStroops: "100000", spendableStroops: "967400000", shortfallStroops: "0", reconciliationStroops: "0" }, after: { balanceStroops: "1000000000", baseAccountReserveStroops: "10000000", subentryReserveStroops: "15000000", sponsoringReserveStroops: "0", sponsoredReserveCreditStroops: "0", minimumReserveStroops: "25000000", sellingLiabilitiesStroops: "12500000", feeAllowanceStroops: "100000", spendableStroops: "962400000", shortfallStroops: "0", reconciliationStroops: "0" }, scenario: { action: "add_entry", count: 1 }, warnings: [], unsupportedEntryTypes: [] };

describe("ReservePlanner", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    wallet.address = stellarWallet;
    wallet.network = "stellar-testnet";
  });
  it("shows observed balance categories and before/after counters", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(complete), { status: 200, headers: { "content-type": "application/json" } }));
    render(<ReservePlanner />); fireEvent.click(screen.getByRole("button", { name: "Calculate reserve plan" }));
    await waitFor(() => expect(screen.getByText("Before and after obligations")).toBeTruthy());
    expect(screen.getByText("Spendable after obligations")).toBeTruthy();
  });
  it("blocks a selected network that differs from the wallet", () => {
    render(<ReservePlanner />);
    fireEvent.change(screen.getByLabelText("Network"), { target: { value: "stellar-pubnet" } });
    expect(screen.getByRole("alert").textContent).toContain("must match");
    expect(screen.getByRole("button", { name: "Calculate reserve plan" })).toHaveProperty("disabled", true);
  });

  it("does not show a late result after the wallet changes", async () => {
    let resolveRequest!: (value: Response) => void;
    vi.spyOn(globalThis, "fetch").mockReturnValue(new Promise((resolve) => { resolveRequest = resolve; }));
    const view = render(<ReservePlanner />);
    fireEvent.click(screen.getByRole("button", { name: "Calculate reserve plan" }));
    wallet.address = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
    view.rerender(<ReservePlanner />);
    resolveRequest(new Response(JSON.stringify(complete), { status: 200, headers: { "content-type": "application/json" } }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByText("Spendable after obligations")).toBeNull();
  });
});
