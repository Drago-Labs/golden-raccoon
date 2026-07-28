"use client";

import { useEffect, useRef } from "react";
import { useAccount } from "wagmi";
import { useStellarWallet } from "@/providers/StellarWalletProvider";

export function useWalletSession() {
  const evm = useAccount();
  const stellar = useStellarWallet();
  const family = stellar.isConnected ? "stellar" : evm.isConnected ? "evm" : null;
  const address = family === "stellar" ? stellar.address : evm.address;
  const lastSynced = useRef<string | null>(null);

  // Establish the server-side wallet session whenever the connected wallet
  // changes. The cookie sets the authoritative scope used by the alert
  // APIs (rules/alerts/observations/deliveries/acknowledge) so they cannot
  // be tricked into reading or mutating another wallet's records by a
  // user-supplied query/body value.
  useEffect(() => {
    if (!address) {
      if (lastSynced.current) {
        lastSynced.current = null;
      }
      return;
    }
    if (lastSynced.current === address) return;
    lastSynced.current = address;

    void fetch("/api/wallet-session", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletAddress: address }),
    }).catch(() => undefined);
  }, [address]);

  return {
    family,
    address: family === "stellar" ? stellar.address : evm.address,
    chain: family === "stellar" ? stellar.network : evm.chain?.name,
    chainId: family === "evm" ? evm.chainId : undefined,
    isConnected: family !== null,
    isConnecting: stellar.isConnecting || evm.status === "connecting" || evm.status === "reconnecting",
    status: family ? "connected" : stellar.isConnecting || evm.status === "connecting" || evm.status === "reconnecting" ? "connecting" : "disconnected",
    stellar,
    evm,
  } as const;
}
