"use client";

import { useEffect, useRef, useState } from "react";
import type { DelegateParticipationResult } from "@/server/research/delegate-participation/schema";

export type DelegateQuery = {
  chain: string;
  tokenAddress: string;
  governorAddress: string;
  delegates: string[];
  topChanges: number;
};

/** Holds one in-flight read at a time and never lets a stale answer overwrite a newer one. */
export function useWorkbenchState() {
  const [result, setResult] = useState<DelegateParticipationResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef<AbortController | null>(null);
  const sequence = useRef(0);

  useEffect(() => () => pending.current?.abort(), []);

  async function read(query: DelegateQuery) {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    const request = ++sequence.current;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/insights/delegate-participation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(query),
        signal: controller.signal,
      });
      const value = await response.json();
      if (sequence.current !== request) return;
      if (!response.ok && value?.state !== "unavailable" && value?.state !== "unsupported_governor") {
        throw new Error(value?.message ?? "The delegate-participation request failed.");
      }
      setResult(value as DelegateParticipationResult);
    } catch (failure) {
      if (!controller.signal.aborted && sequence.current === request) {
        setResult(null);
        setError(failure instanceof Error ? failure.message : "The delegate-participation request failed.");
      }
    } finally {
      if (sequence.current === request) setBusy(false);
    }
  }

  return { result, busy, error, read };
}
