"use client";
import { useState } from "react";
import type { TreasuryReport, WorkState } from "@/server/research/treasury-flows";
export function useWorkbenchState(initial: WorkState<TreasuryReport> | null = null) {
  const [state, setState] = useState(initial);
  const [busy, setBusy] = useState(false);
  async function selectProject(projectId: string) {
    setBusy(true);
    try {
      const response = await fetch("/api/insights/treasury-flows", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ projectId }) });
      setState((await response.json()) as WorkState<TreasuryReport>);
    } finally { setBusy(false); }
  }
  return { state, busy, selectProject };
}
