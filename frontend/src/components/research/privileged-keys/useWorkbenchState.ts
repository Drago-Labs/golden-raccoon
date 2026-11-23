"use client";

import { useState } from "react";
import type { WorkState, InventoryReport } from "@/server/research/privileged-keys";

export function useWorkbenchState(initial: WorkState<InventoryReport> | null = null) {
  const [state, setState] = useState<WorkState<InventoryReport> | null>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function selectProject(projectId: string) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/insights/privileged-keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      const body = (await response.json()) as WorkState<InventoryReport>;
      setState(body);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The inventory request failed.");
    } finally {
      setBusy(false);
    }
  }

  return { state, busy, error, selectProject };
}
