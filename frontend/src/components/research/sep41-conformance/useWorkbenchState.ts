"use client";

import { useRef, useState, type FormEvent } from "react";
import type { Sep41ConformanceReport } from "@/server/research/sep41-conformance";

const NETWORKS = ["stellar-pubnet", "stellar-testnet"] as const;

/**
 * Owns form/request state for the SEP-41 conformance workbench.
 */
export function useWorkbenchState() {
  const [network, setNetwork] = useState<(typeof NETWORKS)[number]>("stellar-pubnet");
  const [contractId, setContractId] = useState("");
  const [balanceId, setBalanceId] = useState("");
  const [report, setReport] = useState<Sep41ConformanceReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!contractId.trim()) {
      setError("Enter a Soroban contract id.");
      return;
    }

    const requestGeneration = ++generation.current;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/insights/sep41-conformance", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contractId: contractId.trim(),
          network,
          balanceId: balanceId.trim() || undefined,
        }),
      });
      const payload = (await response.json()) as {
        report?: Sep41ConformanceReport;
        error?: string;
        message?: string;
      };
      if (requestGeneration !== generation.current) return;
      if (!response.ok || !payload.report) {
        throw new Error(payload.message ?? payload.error ?? `Conformance check failed (${response.status})`);
      }
      setReport(payload.report);
    } catch (caught) {
      if (requestGeneration === generation.current) {
        setError(caught instanceof Error ? caught.message : "Conformance check failed");
        setReport(null);
      }
    } finally {
      if (requestGeneration === generation.current) setBusy(false);
    }
  }

  return {
    networks: NETWORKS,
    network,
    setNetwork,
    contractId,
    setContractId,
    balanceId,
    setBalanceId,
    report,
    error,
    busy,
    submit,
  };
}
