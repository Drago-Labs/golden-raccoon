"use client";
import { useState } from "react";
import type { IntegrityReport, WorkState } from "@/server/research/frontend-integrity";

export function useWorkbenchState(initial: WorkState<IntegrityReport> | null = null) {
  const [state, setState] = useState(initial);
  const [busy, setBusy] = useState(false);
  async function inspect(domain: string) {
    setBusy(true);
    try {
      const response = await fetch("/api/insights/frontend-integrity", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ domain }),
      });
      setState((await response.json()) as WorkState<IntegrityReport>);
    } finally {
      setBusy(false);
    }
  }
  return { state, busy, inspect };
}
