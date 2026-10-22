"use client";

import { useRef, useState, type FormEvent } from "react";
import { useWalletSession } from "@/hooks/useWalletSession";
import type { DeployerHistoryResult } from "@/server/research/deployer-history";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
export const SUPPORTED_NETWORKS = ["ethereum", "base", "arbitrum", "polygon", "optimism", "bsc", "avalanche"] as const;

export function useWorkbenchState() {
  const wallet = useWalletSession();
  const address = wallet.family === "evm" ? wallet.address : undefined;
  const connected = Boolean(address && wallet.family === "evm" && wallet.isConnected);

  const [network, setNetwork] = useState<string>(SUPPORTED_NETWORKS[0]);
  const [contractAddress, setContractAddress] = useState("");
  const [result, setResult] = useState<DeployerHistoryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!address || wallet.family !== "evm") return;
    if (!ADDRESS.test(contractAddress)) {
      setError("Enter a valid contract address.");
      return;
    }

    const requestGeneration = ++generation.current;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/insights/deployer-history", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ walletAddress: address, network, walletNetwork: network, contractAddress }),
      });
      const payload = (await response.json()) as DeployerHistoryResult & { error?: string; message?: string };
      if (requestGeneration !== generation.current) return;
      if (!response.ok) throw new Error(payload.message ?? payload.error ?? `Deployer lookup failed (${response.status})`);
      setResult(payload);
    } catch (caught) {
      if (requestGeneration === generation.current) {
        setError(caught instanceof Error ? caught.message : "Deployer lookup failed");
        setResult(null);
      }
    } finally {
      if (requestGeneration === generation.current) setBusy(false);
    }
  }

  return { connected, network, setNetwork, contractAddress, setContractAddress, result, error, busy, submit };
}
