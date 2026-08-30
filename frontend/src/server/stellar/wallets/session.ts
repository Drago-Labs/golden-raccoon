import type { StellarNetworkId } from "@/lib/stellar/config";
import { getWalletName } from "@/server/stellar/wallets/registry";

/**
 * Wallet session validity (issue #150).
 *
 * A session is the claim "this address, on this network, through this wallet".
 * When any part of that claim stops being true — because the user switched
 * account or network inside the wallet, or disconnected there — the session is
 * stale, and continuing to act on it means acting for a signer that is no
 * longer connected.
 */

export interface WalletSessionSnapshot {
  walletId: string;
  address: string;
  network: StellarNetworkId | null;
}

export interface ObservedWalletState {
  walletId?: string | null;
  address?: string | null;
  network?: StellarNetworkId | null;
}

export type SessionInvalidationReason =
  | "account_changed"
  | "wallet_changed"
  | "network_changed"
  | "disconnected";

/**
 * Compares the session against what the wallet now reports.
 *
 * Order matters: a disconnection explains everything else, and a wallet change
 * explains an address change, so the most fundamental difference is reported
 * rather than a symptom of it.
 */
export function detectSessionInvalidation(
  session: WalletSessionSnapshot | null,
  observed: ObservedWalletState,
): SessionInvalidationReason | null {
  if (!session) return null;

  if (observed.address === null) return "disconnected";
  if (observed.walletId && observed.walletId !== session.walletId) return "wallet_changed";
  if (observed.address && observed.address !== session.address) return "account_changed";

  // An absent observed network is "not reported", not "changed": treating it as
  // a change would tear down the session of every wallet that cannot report.
  if (observed.network && session.network && observed.network !== session.network) {
    return "network_changed";
  }

  return null;
}

const INVALIDATION_MESSAGES: Record<SessionInvalidationReason, (walletName: string) => string> = {
  account_changed: (wallet) =>
    `The account selected in ${wallet} changed, so the previous session no longer matches the connected signer. Reconnect to continue.`,
  wallet_changed: () =>
    "A different wallet is now connected, so the previous session was discarded.",
  network_changed: (wallet) =>
    `${wallet} switched network, so the previous session no longer applies. Reconnect to continue.`,
  disconnected: (wallet) => `${wallet} was disconnected from inside the wallet.`,
};

export function describeInvalidation(
  reason: SessionInvalidationReason,
  walletId: string,
): string {
  return INVALIDATION_MESSAGES[reason](getWalletName(walletId));
}

/**
 * Whether a restored session may be trusted without contacting the wallet.
 *
 * Restoring is display-only by design: it repopulates what the user was looking
 * at and never asks the wallet for anything, so returning to the page can never
 * trigger a signature prompt on its own.
 */
export function isRestorableSession(session: WalletSessionSnapshot | null): session is WalletSessionSnapshot {
  return Boolean(session?.walletId && session.address);
}

/** A restored session is a display claim until the wallet confirms it. */
export interface RestoredSessionState {
  session: WalletSessionSnapshot;
  /** Always false on restore: nothing has been verified with the wallet yet. */
  verified: false;
}

export function restoreSession(session: WalletSessionSnapshot | null): RestoredSessionState | null {
  return isRestorableSession(session) ? { session, verified: false } : null;
}
