import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Networks, KitEventType, type KitEventStateUpdated, type KitEventWalletSelected } from "@creit.tech/stellar-wallets-kit/types";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { StellarWalletProvider, useStellarWallet } from "@/providers/StellarWalletProvider";
import { STELLAR_DISPLAY_SESSION_KEY } from "@/lib/wallet/session";
import type { StellarWalletAdapter } from "@/lib/stellar/wallet-adapter";

vi.mock("@/lib/stellar/wallet-adapter", () => ({
  createStellarWalletAdapter: vi.fn(),
}));

const testAddress = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

function mockAdapter() {
  let stateCallback: ((event: KitEventStateUpdated) => void) | undefined;
  let walletCallback: ((event: KitEventWalletSelected) => void) | undefined;
  let disconnectCallback: (() => void) | undefined;

  return {
    mobileWalletId: "wallet_connect",
    init: vi.fn<StellarWalletAdapter["init"]>(),
    onStateUpdated(callback) {
      stateCallback = callback;
      return () => { stateCallback = undefined; };
    },
    onWalletSelected(callback) {
      walletCallback = callback;
      return () => { walletCallback = undefined; };
    },
    onDisconnect(callback) {
      disconnectCallback = callback;
      return () => { disconnectCallback = undefined; };
    },
    connect: vi.fn<StellarWalletAdapter["connect"]>(async (walletId = "lobstr") => {
      walletCallback?.({
        eventType: KitEventType.WALLET_SELECTED,
        payload: { id: walletId },
      });
      stateCallback?.({
        eventType: KitEventType.STATE_UPDATED,
        payload: { address: testAddress, networkPassphrase: Networks.TESTNET },
      });
      return {
        address: testAddress,
        wallet: { id: walletId, name: walletId === "freighter" ? "Freighter" : walletId === "wallet_connect" ? "WalletConnect" : "LOBSTR" },
      };
    }),
    selectWallet: vi.fn<StellarWalletAdapter["selectWallet"]>(),
    getNetwork: vi.fn<StellarWalletAdapter["getNetwork"]>(async () => ({ network: "TESTNET", networkPassphrase: Networks.TESTNET })),
    signTransaction: vi.fn<StellarWalletAdapter["signTransaction"]>(async () => ({ signedTxXdr: "signed-xdr" })),
    openProfile: vi.fn<StellarWalletAdapter["openProfile"]>(async () => undefined),
    disconnect: vi.fn<StellarWalletAdapter["disconnect"]>(async () => {
      disconnectCallback?.();
    }),
  } satisfies StellarWalletAdapter;
}

function Harness() {
  const wallet = useStellarWallet();
  const [result, setResult] = useState("");

  return (
    <div>
      <output data-testid="state">
        {JSON.stringify({
          address: wallet.address,
          displayAddress: wallet.displayAddress,
          walletId: wallet.walletId,
          network: wallet.network,
          connected: wallet.isConnected,
          restored: wallet.isRestored,
          canSign: wallet.canSign,
          error: wallet.error,
        })}
      </output>
      <button type="button" onClick={() => void wallet.connect("freighter").catch(() => undefined)}>desktop</button>
      <button type="button" onClick={() => void wallet.connect("wallet_connect").catch(() => undefined)}>mobile</button>
      <button type="button" onClick={() => void wallet.signTransaction("unsigned-xdr").then(setResult).catch((error: Error) => setResult(error.message))}>sign</button>
      <button type="button" onClick={() => void wallet.disconnect()}>disconnect</button>
      <output data-testid="result">{result}</output>
    </div>
  );
}

describe("StellarWalletProvider", () => {
  it("restores display state without connecting, requesting access, or signing", async () => {
    const adapter = mockAdapter();
    window.localStorage.setItem(STELLAR_DISPLAY_SESSION_KEY, JSON.stringify({
      version: 1,
      walletId: "freighter",
      walletName: "Freighter",
      adapter: "freighter",
      address: testAddress,
      network: "stellar-testnet",
    }));

    render(<StellarWalletProvider adapter={adapter}><Harness /></StellarWalletProvider>);

    expect((await screen.findByTestId("state")).textContent).toContain(`"displayAddress":"${testAddress}"`);
    expect(screen.getByTestId("state").textContent).toContain('"connected":false');
    expect(screen.getByTestId("state").textContent).toContain('"restored":true');
    expect(adapter.init).toHaveBeenCalledWith(expect.objectContaining({ selectedWalletId: "freighter" }));
    expect(adapter.connect).not.toHaveBeenCalled();
    expect(adapter.signTransaction).not.toHaveBeenCalled();
  });

  it.each([
    ["desktop Freighter", "desktop", "freighter"],
    ["mobile WalletConnect", "mobile", "wallet_connect"],
  ])("connects the %s flow through its selected adapter", async (_label, button, walletId) => {
    const adapter = mockAdapter();
    const user = userEvent.setup();
    render(<StellarWalletProvider adapter={adapter}><Harness /></StellarWalletProvider>);

    await user.click(screen.getByRole("button", { name: button }));

    expect(adapter.connect).toHaveBeenCalledWith(walletId);
    expect((await screen.findByTestId("state")).textContent).toContain(`"walletId":"${walletId}"`);
    expect(screen.getByTestId("state").textContent).toContain('"connected":true');
  });

  it("surfaces connect cancellation and adapter errors", async () => {
    const adapter = mockAdapter();
    adapter.connect.mockRejectedValueOnce(new Error("The user closed the modal."));
    const user = userEvent.setup();
    render(<StellarWalletProvider adapter={adapter}><Harness /></StellarWalletProvider>);

    await user.click(screen.getByRole("button", { name: "desktop" }));

    expect((await screen.findByTestId("state")).textContent).toContain('"error":"The user closed the modal."');
    expect(screen.getByTestId("state").textContent).toContain('"connected":false');
  });

  it("blocks a network mismatch before signing and explains recovery", async () => {
    const adapter = mockAdapter();
    adapter.getNetwork
      .mockResolvedValueOnce({ network: "TESTNET", networkPassphrase: Networks.TESTNET })
      .mockResolvedValueOnce({ network: "PUBLIC", networkPassphrase: Networks.PUBLIC });
    const user = userEvent.setup();
    render(<StellarWalletProvider adapter={adapter}><Harness /></StellarWalletProvider>);
    await user.click(screen.getByRole("button", { name: "desktop" }));

    await user.click(screen.getByRole("button", { name: "sign" }));

    expect((await screen.findByTestId("result")).textContent).toContain("switch it to stellar-testnet");
    expect(adapter.selectWallet).toHaveBeenCalledWith("freighter");
    expect(adapter.signTransaction).not.toHaveBeenCalled();
  });

  it("re-selects the wallet for each approval and clears state on disconnect", async () => {
    const adapter = mockAdapter();
    const user = userEvent.setup();
    render(<StellarWalletProvider adapter={adapter}><Harness /></StellarWalletProvider>);
    await user.click(screen.getByRole("button", { name: "desktop" }));
    await user.click(screen.getByRole("button", { name: "sign" }));

    expect((await screen.findByTestId("result")).textContent).toContain("signed-xdr");
    expect(adapter.selectWallet).toHaveBeenCalledWith("freighter");
    expect(adapter.signTransaction).toHaveBeenCalledWith("unsigned-xdr", {
      address: testAddress,
      networkPassphrase: Networks.TESTNET,
    });

    await act(async () => user.click(screen.getByRole("button", { name: "disconnect" })));
    expect(screen.getByTestId("state").textContent).toContain('"connected":false');
    expect(window.localStorage.getItem(STELLAR_DISPLAY_SESSION_KEY)).toBeNull();
  });
});
