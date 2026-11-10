"use client";

import { useRef, useState, type FormEvent } from "react";
import { useWalletSession } from "@/hooks/useWalletSession";
import type { HoldingCorrelationResult } from "@/server/research/holding-correlation";

export const SUPPORTED_NETWORKS = ["ethereum", "base", "arbitrum", "optimism", "polygon"] as const;

export function useWorkbenchState() {
  const wallet = useWalletSession();
  const address = wallet.address;
  const connected = Boolean(address && wallet.isConnected);

  const [network, setNetwork] = useState<string>(SUPPORTED_NETWORKS[0]);
  const [windowDays, setWindowDays] = useState<string>("30");
  const [clusterThreshold, setClusterThreshold] = useState<string>("0.75");
  const [result, setResult] = useState<HoldingCorrelationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!address) return;
    const days = Number(windowDays);
    const threshold = Number(clusterThreshold);
    if (!Number.isInteger(days) || days < 1 || days > 365) {
      setError("Window days must be an integer between 1 and 365.");
      return;
    }
    if (!Number.isFinite(threshold) || threshold < 0.1 || threshold > 1) {
      setError("Cluster threshold must be between 0.1 and 1.0.");
      return;
    }

    const reqGen = ++generation.current;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/insights/holding-correlation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          walletAddress: address,
          network,
          walletNetwork: network,
          windowDays: days,
          clusterThreshold: threshold,
        }),
      });
      const payload = (await response.json()) as HoldingCorrelationResult & { error?: string; message?: string };
      if (reqGen !== generation.current) return;
      if (!response.ok) throw new Error(payload.message ?? payload.error ?? `Request failed (${response.status})`);
      setResult(payload);
    } catch (caught) {
      if (reqGen === generation.current) {
        setError(caught instanceof Error ? caught.message : "Holding correlation failed");
        setResult(null);
      }
    } finally {
      if (reqGen === generation.current) setBusy(false);
    }
  }

  return {
    connected,
    address,
    network,
    setNetwork,
    windowDays,
    setWindowDays,
    clusterThreshold,
    setClusterThreshold,
    result,
    error,
    busy,
    submit,
  };
}
