"use client";

import { useRef, useState, type FormEvent } from "react";
import { useWalletSession } from "@/hooks/useWalletSession";
import type { MetamorphicCheckResult } from "@/server/research/metamorphic-check";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export function useWorkbenchState() {
  const wallet = useWalletSession();
  const address = wallet.family === "evm" ? wallet.address : undefined;
  const connected = Boolean(address && wallet.isConnected);

  const [network, setNetwork] = useState("ethereum");
  const [contractAddress, setContractAddress] = useState("");
  const [result, setResult] = useState<MetamorphicCheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!address) return;
    if (!ADDRESS.test(contractAddress)) {
      setError("Enter a valid contract address.");
      return;
    }

    const reqGen = ++generation.current;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/insights/metamorphic-check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          walletAddress: address,
          network,
          walletNetwork: network,
          contractAddress,
        }),
      });
      const payload = (await response.json()) as MetamorphicCheckResult & { error?: string; message?: string };
      if (reqGen !== generation.current) return;
      if (!response.ok) throw new Error(payload.message ?? payload.error ?? `Check failed (${response.status})`);
      setResult(payload);
    } catch (caught) {
      if (reqGen === generation.current) {
        setError(caught instanceof Error ? caught.message : "Metamorphic check failed");
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
    contractAddress,
    setContractAddress,
    result,
    error,
    busy,
    submit,
  };
}
