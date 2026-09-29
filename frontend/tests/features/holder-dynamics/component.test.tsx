import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HolderDynamicsWorkspace } from "@/components/research/holder-dynamics/HolderDynamicsWorkspace";

vi.mock("@/hooks/useWalletSession", () => ({
  useWalletSession: () => ({ family: "evm", address: "0x1111111111111111111111111111111111111111" }),
}));
vi.mock("@/lib/e2e/browserWallet", () => ({
  isE2eTestMode: () => false,
  readE2eWalletOverride: () => null,
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("HolderDynamicsWorkspace", () => {
  it("shows concentration tables after analyze", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          state: "complete",
          toBlock: 110,
          topHolderShareBps: 9000,
          top10ShareBps: 9000,
          coverageRatio: 1,
          warnings: [],
          holders: [
            {
              key: "ethereum:0x1",
              address: "0x0000000000000000000000000000000000000001",
              balanceRaw: "900",
              label: "unknown",
            },
          ],
          movements: [{ kind: "mint", amountRaw: "50", txHash: "0x1", note: "zero-address mint" }],
          scoreUnchanged: true,
        }),
      })),
    );

    render(<HolderDynamicsWorkspace />);
    const button = screen.getByRole("button", { name: /Analyze holders/i });
    button.focus();
    expect(document.activeElement).toBe(button);
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText("complete")).toBeTruthy();
    });
    expect(screen.getByRole("table", { name: /Holder balances/i })).toBeTruthy();
    expect(screen.getByRole("table", { name: /Movements/i })).toBeTruthy();
    expect(screen.getByText(/9000/)).toBeTruthy();
  });

  it("announces analysis failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 500,
        json: async () => ({ error: "Indexer down" }),
      })),
    );
    render(<HolderDynamicsWorkspace />);
    fireEvent.click(screen.getByRole("button", { name: /Analyze holders/i }));
    await waitFor(() => {
      expect(screen.getAllByText(/Indexer down/i).length).toBeGreaterThan(0);
    });
  });
});
