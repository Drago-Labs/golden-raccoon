"use client";

import { useRef, useState, type FormEvent } from "react";
import { useWalletSession } from "@/hooks/useWalletSession";
import type { SeriesInterval, VolatilityProfileResult } from "@/server/research/volatility-profile";

export function useWorkbenchState() {
  const wallet = useWalletSession();
  const address = wallet.address;
  const connected = Boolean(address && wallet.isConnected);

  const [network, setNetwork] = useState("ethereum");
  const [assetSymbol, setAssetSymbol] = useState("XLM");
  const [interval, setInterval] = useState<SeriesInterval>("1d");
  const [windowDays, setWindowDays] = useState("30");
  const [result, setResult] = useState<VolatilityProfileResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!address) return;
    if (!assetSymbol.trim()) {
      setError("Enter an asset symbol.");
      return;
    }
    const reqGen = ++generation.current;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/insights/volatility-profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          walletAddress: address,
          network,
          walletNetwork: network,
          assetSymbol: assetSymbol.trim(),
          interval,
          windowDays: Number(windowDays),
        }),
      });
      const payload = (await response.json()) as VolatilityProfileResult & { error?: string; message?: string };
      if (reqGen !== generation.current) return;
      if (!response.ok) throw new Error(payload.message ?? payload.error ?? `Profile failed (${response.status})`);
      setResult(payload);
    } catch (caught) {
      if (reqGen === generation.current) {
        setError(caught instanceof Error ? caught.message : "Volatility profile failed");
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
    assetSymbol,
    setAssetSymbol,
    interval,
    setInterval,
    windowDays,
    setWindowDays,
    result,
    error,
    busy,
    submit,
  };
}
