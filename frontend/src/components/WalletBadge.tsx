"use client";

import { getDefaultStellarNetwork } from "@/lib/stellar/config";
import { shortenWalletAddress } from "@/lib/wallet/session";
import { useStellarWallet } from "@/providers/StellarWalletProvider";
import { networkLabel } from "@/server/stellar/wallets/mismatch";
import { getWalletName } from "@/server/stellar/wallets/registry";

/**
 * Identifies the connected signer: which wallet, which network, which address
 * (issue #150).
 *
 * A user with several wallets installed needs to see which one is actually
 * connected before they sign, and a restored session is labelled as unverified
 * so it is not mistaken for a live connection.
 */
export function WalletBadge() {
  const { displayAddress, walletId, network, isConnected, isRestored, capabilities } =
    useStellarWallet();

  if (!displayAddress || !walletId) return null;

  const explorerBase = getDefaultStellarNetwork().explorerUrl;

  return (
    <span className="inline-flex flex-wrap items-center gap-2 text-xs text-white/75">
      <span className="font-semibold text-white">{getWalletName(walletId)}</span>

      <span className="rounded-full border border-white/15 px-2 py-0.5">
        {network ? networkLabel(network) : "network not reported"}
      </span>

      <a
        href={`${explorerBase}/account/${displayAddress}`}
        target="_blank"
        rel="noreferrer noopener"
        className="font-mono underline underline-offset-2 hover:text-white"
      >
        {shortenWalletAddress(displayAddress)}
      </a>

      {isRestored && !isConnected ? (
        <span className="rounded-full border border-white/15 px-2 py-0.5 text-white/55">
          restored, not verified
        </span>
      ) : null}

      {capabilities.hardwareBacked ? (
        <span className="rounded-full border border-white/15 px-2 py-0.5">hardware</span>
      ) : null}
    </span>
  );
}

export default WalletBadge;
