import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VaultAccountingWorkbench } from "@/components/research/vault-accounting/VaultAccountingWorkbench";
import { vaultAddress, wallet } from "./fixtures";

const walletMock = vi.hoisted(() => ({ address: "0x9999999999999999999999999999999999999999" }));
vi.mock("@/hooks/useWalletSession", () => ({
  useWalletSession: () => ({ family: "evm", address: walletMock.address, isConnected: true }),
}));

const completeResult = {
  network: "ethereum",
  vaultAddress,
  blockNumber: 100,
  state: "complete",
  conformance: { conforming: true, missing: [] },
  asset: "0x2222222222222222222222222222222222222222",
  totalAssets: "1000000",
  totalSupply: "1000000",
  sharePrice: { assetsPerShareScaled: (10n ** 18n).toString(), scale: (10n ** 18n).toString() },
  roundingSamples: [
    { amount: "1000", sharesFromDeposit: "1000", assetsRoundTrip: "998", lossRaw: "2", direction: "favors_vault" },
  ],
  underlyingBalance: { totalAssets: "1000000", actualBalance: "1000000", assetsElsewhere: "0", deficit: false },
  priceSamples: [
    { blockNumber: 0, sharePrice: { assetsPerShareScaled: (10n ** 18n).toString(), scale: (10n ** 18n).toString() } },
    { blockNumber: 100, sharePrice: { assetsPerShareScaled: (10n ** 18n).toString(), scale: (10n ** 18n).toString() } },
  ],
  priceJumps: [],
  coverage: {
    reachedProvider: true,
    conformance: { conforming: true, missing: [] },
    roundingSamplesRequested: 1,
    roundingSamplesAvailable: 1,
    priceSamplesRequested: 5,
    priceSamplesAvailable: 2,
  },
  warnings: [],
};

describe("VaultAccountingWorkbench", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    walletMock.address = wallet;
  });

  it("exposes an accessible form, submits, and renders results by role rather than styling", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(completeResult), { status: 200, headers: { "content-type": "application/json" } }),
    );

    render(<VaultAccountingWorkbench />);
    fireEvent.change(screen.getByLabelText("Vault address"), { target: { value: vaultAddress } });
    fireEvent.click(screen.getByRole("button", { name: "Read vault accounting" }));

    await waitFor(() => expect(screen.getByRole("region", { name: "Vault accounting results" })).toBeTruthy());
    expect(screen.getAllByText("1000000").length).toBeGreaterThan(0);
    expect(screen.getByText("Coverage")).toBeTruthy();
  });

  it("lets a caller add and remove sample amounts before submitting", () => {
    render(<VaultAccountingWorkbench />);
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "500" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(screen.getByText("500")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(screen.queryByText("500")).toBeNull();
  });

  it("shows an alert on failure and never renders a mutating action", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "provider_unavailable", message: "Provider rate limited" }), {
        status: 503,
        headers: { "content-type": "application/json" },
      }),
    );

    render(<VaultAccountingWorkbench />);
    fireEvent.change(screen.getByLabelText("Vault address"), { target: { value: vaultAddress } });
    fireEvent.click(screen.getByRole("button", { name: "Read vault accounting" }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByRole("alert").textContent).toContain("Provider rate limited");
    expect(screen.queryByRole("button", { name: /deposit|withdraw|sign|approve/i })).toBeNull();
  });

  it("disables submission and shows a connect prompt when no wallet is connected", () => {
    walletMock.address = "";
    render(<VaultAccountingWorkbench />);
    const submitButton = screen.getByRole("button", { name: "Read vault accounting" }) as HTMLButtonElement;
    expect(submitButton.disabled).toBe(true);
    expect(screen.getByRole("alert").textContent).toContain("Connect an EVM wallet");
  });
});
