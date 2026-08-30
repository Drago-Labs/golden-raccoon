import assert from "node:assert/strict";

import {
  availableWallets,
  getWalletDefinition,
  getWalletName,
  hasMobileCapableWallet,
  stellarWalletRegistry,
} from "../src/server/stellar/wallets/registry";
import {
  canPerform,
  capabilityMatrix,
  describeMissingCapability,
  gateOnCapability,
  getWalletCapabilities,
} from "../src/server/stellar/wallets/capabilities";
import { blocksSigning, resolveNetworkMismatch } from "../src/server/stellar/wallets/mismatch";
import {
  detectSessionInvalidation,
  describeInvalidation,
  restoreSession,
} from "../src/server/stellar/wallets/session";

/**
 * Drives the multi-wallet layer through the behaviours that differ between
 * wallets, including a simulated wallet that reports no network.
 *
 * The value of this check is the negative cases: a wallet that cannot do
 * something must produce a stated reason, and a session that no longer matches
 * its signer must be invalidated rather than quietly reused.
 */

async function main() {
  // ------------------------------------------------------------- registry

  assert.ok(Object.keys(stellarWalletRegistry).length > 1, "More than one wallet must be enabled");
  assert.ok(
    hasMobileCapableWallet({ walletConnectConfigured: false }),
    "At least one mobile-capable wallet must be available without WalletConnect configuration",
  );

  const withoutWalletConnect = availableWallets({ walletConnectConfigured: false });
  assert.ok(
    !withoutWalletConnect.some((wallet) => wallet.id === "wallet_connect"),
    "WalletConnect must not be offered until it is configured",
  );
  assert.ok(
    availableWallets({ walletConnectConfigured: true }).some((wallet) => wallet.id === "wallet_connect"),
    "WalletConnect must be offered once configured",
  );

  assert.equal(getWalletName("freighter"), "Freighter");
  assert.equal(getWalletName("a-wallet-added-later"), "a-wallet-added-later");
  assert.equal(getWalletDefinition("a-wallet-added-later"), undefined);

  // ---------------------------------------------------------- capabilities

  for (const row of capabilityMatrix()) {
    assert.equal(row.sign, true, `${row.name} must be able to sign to be listed`);
  }

  const unknown = getWalletCapabilities("a-wallet-added-later");
  assert.equal(unknown.sign, true, "An unknown wallet may still sign");
  assert.equal(
    unknown.reportsNetwork,
    false,
    "An unknown wallet must not be assumed to report its network",
  );
  assert.equal(
    unknown.accountSwitching,
    false,
    "An unknown wallet must not be assumed to announce account changes",
  );

  assert.equal(canPerform("albedo", "reportsNetwork"), false);
  assert.equal(canPerform("freighter", "reportsNetwork"), true);

  const gated = gateOnCapability("albedo", "reportsNetwork");
  assert.equal(gated.allowed, false);
  assert.ok(gated.reason && gated.reason.includes("Albedo"), "A refusal must name the wallet");
  assert.ok(
    gated.reason!.length > 40,
    "A refusal must explain itself, not just state that something is unavailable",
  );

  assert.equal(gateOnCapability("freighter", "reportsNetwork").allowed, true);
  assert.equal(gateOnCapability("freighter", "reportsNetwork").reason, null);

  assert.ok(describeMissingCapability("xbull", "hardwareBacked").includes("xBull"));

  // -------------------------------------------------------- network mismatch

  const match = resolveNetworkMismatch("freighter", "stellar-testnet", "stellar-testnet");
  assert.equal(match.kind, "match");
  assert.equal(match.message, null);
  assert.equal(blocksSigning(match), false);

  const mismatch = resolveNetworkMismatch("freighter", "stellar-pubnet", "stellar-testnet");
  assert.equal(mismatch.kind, "mismatch");
  assert.ok(mismatch.message!.includes("Pubnet") && mismatch.message!.includes("Testnet"));
  assert.equal(blocksSigning(mismatch), true, "A real mismatch must block signing");

  // The simulated non-reporting wallet the issue asks for.
  const unreported = resolveNetworkMismatch("albedo", null, "stellar-pubnet");
  assert.equal(unreported.kind, "unreported");
  assert.notEqual(unreported.kind, "match", "An unreported network must never read as a match");
  assert.ok(
    unreported.message.includes("Pubnet"),
    "An unreported network must still tell the user which network to confirm",
  );
  assert.equal(
    blocksSigning(unreported),
    false,
    "An unreported network is surfaced, not blocking, or several wallets become unusable",
  );

  // A wallet that should report but did not is equally unverified.
  const silentReporter = resolveNetworkMismatch("freighter", null, "stellar-testnet");
  assert.equal(silentReporter.kind, "unreported");
  assert.ok(silentReporter.message.includes("did not report"));

  // ---------------------------------------------------------------- session

  const session = { walletId: "freighter", address: "GA".padEnd(56, "X"), network: "stellar-testnet" as const };

  assert.equal(detectSessionInvalidation(session, { address: session.address }), null);
  assert.equal(detectSessionInvalidation(null, { address: null }), null);

  assert.equal(
    detectSessionInvalidation(session, { address: "GB".padEnd(56, "X") }),
    "account_changed",
    "Switching accounts inside the wallet must invalidate the session",
  );
  assert.equal(detectSessionInvalidation(session, { address: null }), "disconnected");
  assert.equal(
    detectSessionInvalidation(session, { walletId: "xbull", address: "GB".padEnd(56, "X") }),
    "wallet_changed",
    "A wallet change explains an address change and must be reported instead of it",
  );
  assert.equal(
    detectSessionInvalidation(session, { address: session.address, network: "stellar-pubnet" }),
    "network_changed",
  );
  assert.equal(
    detectSessionInvalidation(session, { address: session.address, network: null }),
    null,
    "A wallet that cannot report its network must not have its session torn down",
  );

  assert.ok(describeInvalidation("account_changed", "freighter").includes("Freighter"));
  assert.ok(describeInvalidation("disconnected", "xbull").includes("xBull"));

  const restored = restoreSession(session);
  assert.ok(restored, "A complete session must be restorable for display");
  assert.equal(
    restored!.verified,
    false,
    "A restored session is a display claim until the wallet confirms it — restoring must never prompt a signature",
  );
  assert.equal(restoreSession(null), null);
  assert.equal(restoreSession({ walletId: "freighter", address: "", network: null }), null);

  console.log("Stellar wallet capability checks passed.");
}

void main();
