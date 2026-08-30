import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SELECTED_WALLET_FAMILY_KEY } from "@/lib/wallet/session";
import { WalletSessionProvider, useWalletSessionContext } from "@/providers/WalletSessionProvider";

const stellarAddress = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
const evmAddress = "0x1111111111111111111111111111111111111111";

const mocks = vi.hoisted(() => ({
  stellar: {
    address: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
    displayAddress: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
    network: "stellar-testnet",
    walletName: "Freighter",
    isConnected: true,
    isConnecting: false,
    isRestored: false,
    canSign: true,
    mismatchMessage: null,
    capabilities: { sign: true, reportsNetwork: true, accountSwitching: true, hardwareBacked: false },
    networkStatus: {
      kind: "match",
      expected: "stellar-testnet",
      walletNetwork: "stellar-testnet",
      message: null,
    },
    sessionNotice: null,
  },
  evm: {
    address: "0x1111111111111111111111111111111111111111",
    chainId: 8453,
    chain: {
      name: "Base",
      unsupported: false,
      blockExplorers: { default: { url: "https://basescan.org" } },
    },
    connector: { name: "Coinbase Wallet" },
    isConnected: true,
    status: "connected",
  },
}));

vi.mock("wagmi", () => ({
  useAccount: () => mocks.evm,
}));

vi.mock("@/providers/StellarWalletProvider", () => ({
  useStellarWallet: () => mocks.stellar,
}));

function Harness() {
  const session = useWalletSessionContext();
  return (
    <div>
      <output data-testid="session">{JSON.stringify({
        family: session.family,
        address: session.address,
        chain: session.chain,
        walletType: session.walletType,
      })}</output>
      <button type="button" onClick={() => session.selectFamily("evm")}>EVM</button>
      <button type="button" onClick={() => session.selectFamily("stellar")}>Stellar</button>
    </div>
  );
}

describe("WalletSessionProvider", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("keeps simultaneous EVM and Stellar accounts isolated behind explicit selection", async () => {
    window.localStorage.setItem(SELECTED_WALLET_FAMILY_KEY, "evm");
    const user = userEvent.setup();
    render(<WalletSessionProvider><Harness /></WalletSessionProvider>);

    expect(screen.getByTestId("session").textContent).toContain(`"address":"${evmAddress}"`);
    expect(screen.getByTestId("session").textContent).not.toContain(stellarAddress);

    await user.click(screen.getByRole("button", { name: "Stellar" }));
    expect(screen.getByTestId("session").textContent).toContain(`"address":"${stellarAddress}"`);
    expect(screen.getByTestId("session").textContent).not.toContain(evmAddress);

    await user.click(screen.getByRole("button", { name: "EVM" }));
    expect(screen.getByTestId("session").textContent).toContain(`"address":"${evmAddress}"`);
  });

  it("restores only the explicitly selected family after remount", () => {
    window.localStorage.setItem(SELECTED_WALLET_FAMILY_KEY, "stellar");
    const first = render(<WalletSessionProvider><Harness /></WalletSessionProvider>);
    expect(screen.getByTestId("session").textContent).toContain('"family":"stellar"');
    first.unmount();

    render(<WalletSessionProvider><Harness /></WalletSessionProvider>);
    expect(screen.getByTestId("session").textContent).toContain('"family":"stellar"');
    expect(screen.getByTestId("session").textContent).toContain(`"address":"${stellarAddress}"`);
  });
});
