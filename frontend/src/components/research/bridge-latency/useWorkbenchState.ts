"use client";
import { useState } from "react";
import type { BridgeReport, WorkState } from "@/server/research/bridge-latency";
export function useWorkbenchState(initial: WorkState<BridgeReport> | null = null) {
  const [state, setState] = useState(initial);
  const [busy, setBusy] = useState(false);
  async function selectBridge(bridge: string) {
    setBusy(true);
    try {
      const response = await fetch("/api/insights/bridge-latency", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ bridge }) });
      setState((await response.json()) as WorkState<BridgeReport>);
    } finally { setBusy(false); }
  }
  return { state, busy, selectBridge };
}
