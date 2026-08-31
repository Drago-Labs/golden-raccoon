"use client";

import { useStellarWallet } from "@/providers/StellarWalletProvider";

/**
 * Surfaces the wallet's network verdict (issue #150).
 *
 * Three states, not two. A wallet that cannot report its network is shown as
 * unverified with an instruction, rather than as either "fine" or "broken" —
 * the first is a lie and the second makes several wallets look faulty.
 */
export function NetworkMismatchNotice() {
  const { networkStatus, sessionNotice } = useStellarWallet();

  if (sessionNotice) {
    return (
      <p
        role="status"
        className="rounded-md border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs leading-5 text-amber-200"
      >
        {sessionNotice}
      </p>
    );
  }

  if (!networkStatus || networkStatus.kind === "match") return null;

  const blocking = networkStatus.kind === "mismatch";

  return (
    <p
      role={blocking ? "alert" : "status"}
      className={
        blocking
          ? "rounded-md border border-red-400/30 bg-red-400/10 px-3 py-2 text-xs leading-5 text-red-200"
          : "rounded-md border border-white/15 bg-white/5 px-3 py-2 text-xs leading-5 text-white/75"
      }
    >
      {networkStatus.message}
    </p>
  );
}

export default NetworkMismatchNotice;
