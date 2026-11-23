"use client";

import { useEffect, useRef, useState } from "react";
import { readOfflineState } from "@/lib/offlineStore";
import { observationFromReadApi } from "@/server/research/performance-attribution/snapshotReader";
import type { AttributionResult, SnapshotInput } from "@/server/research/performance-attribution/schema";
import { ATTRIBUTION_LIMITS } from "@/server/research/performance-attribution/limits";

export type AttributionQuery = {
  walletAddress: string;
  network: string;
  windowStart: string;
  windowEnd: string;
  granularity: "day" | "week" | "month";
  includeLiveSnapshot: boolean;
};

/**
 * Collects the portfolio observations this browser already holds — the offline
 * capture store the rest of the app writes — and asks the route to attribute
 * them. Nothing new is stored here.
 */
export function recordedObservations(walletAddress: string, network: string): SnapshotInput[] {
  const observations: SnapshotInput[] = [];
  for (const capture of readOfflineState().portfolios) {
    if (capture.data?.walletAddress !== walletAddress) continue;
    try {
      observations.push(observationFromReadApi(capture.data, network, capture.source ?? "Offline portfolio capture"));
    } catch {
      // A capture that does not normalize is not evidence for this portfolio.
    }
  }
  return observations.slice(-ATTRIBUTION_LIMITS.maxSnapshots);
}

export function useWorkbenchState() {
  const [result, setResult] = useState<AttributionResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef<AbortController | null>(null);
  const sequence = useRef(0);

  useEffect(() => () => pending.current?.abort(), []);

  async function read(query: AttributionQuery) {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    const request = ++sequence.current;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/insights/performance-attribution", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...query, snapshots: recordedObservations(query.walletAddress, query.network) }),
        signal: controller.signal,
      });
      const value = await response.json();
      if (sequence.current !== request) return;
      if (!response.ok && value?.state !== "unavailable") {
        throw new Error(value?.message ?? "The attribution request failed.");
      }
      setResult(value as AttributionResult);
    } catch (failure) {
      if (!controller.signal.aborted && sequence.current === request) {
        setResult(null);
        setError(failure instanceof Error ? failure.message : "The attribution request failed.");
      }
    } finally {
      if (sequence.current === request) setBusy(false);
    }
  }

  return { result, busy, error, read };
}
