"use client";

import { useRef, useState, type FormEvent } from "react";
import { useWalletSession } from "@/hooks/useWalletSession";
import type { EvmTimelockResult } from "@/server/research/evm-timelock";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export function useWorkbenchState() {
  const wallet = useWalletSession();
  const address = wallet.family === "evm" ? wallet.address : undefined;
  const connected = Boolean(address && wallet.isConnected);

  const [network, setNetwork] = useState("ethereum");
  const [timelockAddress, setTimelockAddress] = useState("");
  const [result, setResult] = useState<EvmTimelockResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!address) return;
    if (!ADDRESS.test(timelockAddress)) {
      setError("Enter a valid TimelockController contract address.");
      return;
    }

    const reqGen = ++generation.current;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/insights/evm-timelock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          walletAddress: address,
          network,
          walletNetwork: network,
          timelockAddress,
        }),
      });
      const payload = (await response.json()) as EvmTimelockResult & { error?: string; message?: string };
      if (reqGen !== generation.current) return;
      if (!response.ok) throw new Error(payload.message ?? payload.error ?? `Timelock read failed (${response.status})`);
      setResult(payload);
    } catch (caught) {
      if (reqGen === generation.current) {
        setError(caught instanceof Error ? caught.message : "Timelock inspection failed");
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
    timelockAddress,
    setTimelockAddress,
    result,
    error,
    busy,
    submit,
  };
}
