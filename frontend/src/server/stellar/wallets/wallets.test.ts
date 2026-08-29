import { describe, expect, it } from "vitest";

import { availableWallets, getWalletName, hasMobileCapableWallet } from "@/server/stellar/wallets/registry";
import { gateOnCapability, getWalletCapabilities } from "@/server/stellar/wallets/capabilities";
import { blocksSigning, resolveNetworkMismatch } from "@/server/stellar/wallets/mismatch";
import { detectSessionInvalidation, restoreSession } from "@/server/stellar/wallets/session";

const ADDRESS_A = `GA${"X".repeat(54)}`;
const ADDRESS_B = `GB${"X".repeat(54)}`;

describe("wallet registry", () => {
  it("offers more than one wallet, including a mobile-capable option", () => {
    const wallets = availableWallets({ walletConnectConfigured: false });

    expect(wallets.length).toBeGreaterThan(1);
    expect(hasMobileCapableWallet({ walletConnectConfigured: false })).toBe(true);
  });

  it("withholds WalletConnect until it is configured", () => {
    const ids = (configured: boolean) =>
      availableWallets({ walletConnectConfigured: configured }).map((wallet) => wallet.id);

    expect(ids(false)).not.toContain("wallet_connect");
    expect(ids(true)).toContain("wallet_connect");
  });
});

describe("wallet capabilities", () => {
  it("treats an unlisted wallet conservatively rather than optimistically", () => {
    const capabilities = getWalletCapabilities("a-wallet-added-later");

    expect(capabilities.sign).toBe(true);
    expect(capabilities.reportsNetwork).toBe(false);
    expect(capabilities.accountSwitching).toBe(false);
  });

  it("states why an action is unavailable instead of only disabling it", () => {
    const gate = gateOnCapability("albedo", "reportsNetwork");

    expect(gate.allowed).toBe(false);
    expect(gate.reason).toContain("Albedo");
    expect(gate.reason!.length).toBeGreaterThan(40);
  });

  it("allows a capability the wallet has, with no reason attached", () => {
    expect(gateOnCapability("freighter", "reportsNetwork")).toEqual({ allowed: true, reason: null });
  });
});

describe("network mismatch", () => {
  it("blocks signing only for a real mismatch", () => {
    const mismatch = resolveNetworkMismatch("freighter", "stellar-pubnet", "stellar-testnet");

    expect(mismatch.kind).toBe("mismatch");
    expect(blocksSigning(mismatch)).toBe(true);
  });

  it("never reports an unreported network as a match", () => {
    const unreported = resolveNetworkMismatch("albedo", null, "stellar-pubnet");

    expect(unreported.kind).toBe("unreported");
    expect(unreported.message).toContain("Pubnet");
    // Surfaced, not blocking: refusing every non-reporting wallet is worse.
    expect(blocksSigning(unreported)).toBe(false);
  });

  it("treats a wallet that should have reported but did not as unverified", () => {
    const silent = resolveNetworkMismatch("freighter", null, "stellar-testnet");

    expect(silent.kind).toBe("unreported");
    expect(silent.message).toContain("did not report");
  });
});

describe("wallet session", () => {
  const session = { walletId: "freighter", address: ADDRESS_A, network: "stellar-testnet" as const };

  it("invalidates a session when the account changes inside the wallet", () => {
    expect(detectSessionInvalidation(session, { address: ADDRESS_B })).toBe("account_changed");
  });

  it("reports a wallet change rather than the address change it causes", () => {
    expect(detectSessionInvalidation(session, { walletId: "xbull", address: ADDRESS_B })).toBe(
      "wallet_changed",
    );
  });

  it("keeps a session whose wallet cannot report a network", () => {
    expect(detectSessionInvalidation(session, { address: ADDRESS_A, network: null })).toBeNull();
  });

  it("restores a session for display without marking it verified", () => {
    const restored = restoreSession(session);

    expect(restored).not.toBeNull();
    // Restoring must never imply the wallet was contacted.
    expect(restored!.verified).toBe(false);
  });

  it("refuses to restore an incomplete session", () => {
    expect(restoreSession({ walletId: "freighter", address: "", network: null })).toBeNull();
  });
});

describe("wallet naming", () => {
  it("falls back to the raw id for a wallet the registry does not know", () => {
    expect(getWalletName("freighter")).toBe("Freighter");
    expect(getWalletName("brand-new-wallet")).toBe("brand-new-wallet");
  });
});
