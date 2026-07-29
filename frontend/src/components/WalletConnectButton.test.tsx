import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WalletConnectButton } from "@/components/WalletConnectButton";

const mocks = vi.hoisted(() => ({
  connect: vi.fn(async () => undefined),
  selectFamily: vi.fn(),
  openConnectModal: vi.fn(),
}));

vi.mock("@rainbow-me/rainbowkit", () => ({
  ConnectButton: {
    Custom: ({ children }: { children: (state: object) => React.ReactNode }) => children({
      account: undefined,
      chain: undefined,
      mounted: true,
      openAccountModal: vi.fn(),
      openChainModal: vi.fn(),
      openConnectModal: mocks.openConnectModal,
    }),
  },
}));

vi.mock("@/hooks/useWalletSession", () => ({
  useWalletSession: () => ({
    family: null,
    selectedFamily: null,
    selectFamily: mocks.selectFamily,
    address: undefined,
    chain: undefined,
    walletType: undefined,
    explorerUrl: undefined,
    signerCapability: "unavailable",
    isConnecting: false,
    isRestored: false,
    connectedFamilies: { evm: false, stellar: false },
    stellar: {
      connect: mocks.connect,
      isConnecting: false,
      mobileAvailable: true,
      isRestored: false,
      displayAddress: undefined,
      error: undefined,
      mismatchMessage: null,
    },
  }),
}));

describe("WalletConnectButton", () => {
  beforeEach(() => {
    mocks.connect.mockClear();
    mocks.selectFamily.mockClear();
  });

  it("is keyboard accessible and closes the selector with Escape", async () => {
    const user = userEvent.setup();
    render(<WalletConnectButton />);
    await user.click(screen.getByRole("button", { name: "Connect Wallet" }));

    expect(screen.getByRole("dialog", { name: "Wallet session" })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close wallet selector" }));

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Wallet session" })).toBeNull();
  });

  it("routes the mobile-compatible flow to WalletConnect", async () => {
    const user = userEvent.setup();
    render(<WalletConnectButton />);
    await user.click(screen.getByRole("button", { name: "Connect Wallet" }));
    await user.click(screen.getByRole("button", { name: /Mobile Stellar wallet/ }));

    expect(mocks.selectFamily).toHaveBeenCalledWith("stellar");
    expect(mocks.connect).toHaveBeenCalledWith("wallet_connect");
  });
});
