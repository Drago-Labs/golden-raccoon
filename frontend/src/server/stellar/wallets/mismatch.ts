import type { StellarNetworkId } from "@/lib/stellar/config";
import { canPerform } from "@/server/stellar/wallets/capabilities";
import { getWalletName } from "@/server/stellar/wallets/registry";

/**
 * Network mismatch resolution (issue #150).
 *
 * Three outcomes, not two. A wallet that does not report its network is not
 * "matching" — it is unverified, and saying so is the difference between a user
 * who checks and a user who signs a pubnet transaction believing they are on
 * testnet.
 */

export type NetworkMismatch =
  | { kind: "match"; expected: StellarNetworkId; walletNetwork: StellarNetworkId; message: null }
  | { kind: "mismatch"; expected: StellarNetworkId; walletNetwork: StellarNetworkId; message: string }
  | { kind: "unreported"; expected: StellarNetworkId; walletNetwork: null; message: string };

const NETWORK_LABELS: Record<StellarNetworkId, string> = {
  "stellar-testnet": "Stellar Testnet",
  "stellar-pubnet": "Stellar Pubnet",
};

export function networkLabel(network: StellarNetworkId): string {
  return NETWORK_LABELS[network];
}

/**
 * Resolves what the wallet's network means for this app.
 *
 * `walletNetwork` is null when the wallet did not report one. That is treated
 * as unverified for every wallet, whether or not the capability table says it
 * should have reported — a wallet that was supposed to answer and did not is
 * exactly as unverified as one that never could.
 */
export function resolveNetworkMismatch(
  walletId: string,
  walletNetwork: StellarNetworkId | null | undefined,
  expected: StellarNetworkId,
): NetworkMismatch {
  if (!walletNetwork) {
    const wallet = getWalletName(walletId);
    const suffix = canPerform(walletId, "reportsNetwork")
      ? `${wallet} did not report its network on this connection.`
      : `${wallet} does not report its network.`;

    return {
      kind: "unreported",
      expected,
      walletNetwork: null,
      message: `${suffix} Confirm it is on ${networkLabel(expected)} before signing — this app cannot verify it for you.`,
    };
  }

  if (walletNetwork === expected) {
    return { kind: "match", expected, walletNetwork, message: null };
  }

  return {
    kind: "mismatch",
    expected,
    walletNetwork,
    message: `${getWalletName(walletId)} is on ${networkLabel(walletNetwork)} while this app is using ${networkLabel(expected)}. Switch the network in the wallet, then reconnect.`,
  };
}

/**
 * Whether signing may proceed.
 *
 * An unreported network does not block signing — that would make several
 * wallets unusable — but it is surfaced every time, and it is never silently
 * treated as a match.
 */
export function blocksSigning(mismatch: NetworkMismatch): boolean {
  return mismatch.kind === "mismatch";
}
