"use client";

import { useRef, useState, type FormEvent } from "react";
import { useWalletSession } from "@/hooks/useWalletSession";
import type { EnsResolutionResult } from "@/server/research/ens-resolution";

export function useWorkbenchState() {
  const wallet = useWalletSession();
  const address = wallet.family === "evm" ? wallet.address : undefined;
  const connected = Boolean(address && wallet.isConnected);

  const [network, setNetwork] = useState("ethereum");
  const [ensName, setEnsName] = useState("");
  const [targetAddress, setTargetAddress] = useState("");
  const [result, setResult] = useState<EnsResolutionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!address) return;
    if (!ensName.trim() && !targetAddress.trim()) {
      setError("Enter an ENS name or an EVM address.");
      return;
    }

    const reqGen = ++generation.current;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/insights/ens-resolution", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          walletAddress: address,
          network,
          walletNetwork: network,
          ensName: ensName.trim() || undefined,
          targetAddress: targetAddress.trim() || undefined,
        }),
      });
      const payload = (await response.json()) as EnsResolutionResult & { error?: string; message?: string };
      if (reqGen !== generation.current) return;
      if (!response.ok) throw new Error(payload.message ?? payload.error ?? `Verification failed (${response.status})`);
      setResult(payload);
    } catch (caught) {
      if (reqGen === generation.current) {
        setError(caught instanceof Error ? caught.message : "ENS verification failed");
        setResult(null);
      }
    } finally {
      if (reqGen === generation.current) setBusy(false);
    }
  }

  return {
    connected,
    network,
    setNetwork,
    ensName,
    setEnsName,
    targetAddress,
    setTargetAddress,
    result,
    error,
    busy,
    submit,
  };
}
