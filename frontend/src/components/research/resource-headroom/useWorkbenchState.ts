"use client";

import { useRef, useState, type FormEvent } from "react";
import {
  SUPPORTED_HEADROOM_NETWORKS,
  type HeadroomNetwork,
  type ResourceHeadroomReport,
} from "@/server/research/resource-headroom";

const DEFAULT_CONTRACT = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM";

export function useWorkbenchState() {
  const [network, setNetwork] = useState<HeadroomNetwork>(SUPPORTED_HEADROOM_NETWORKS[0]);
  const [mode, setMode] = useState<"simulation" | "historical">("simulation");
  const [contractId, setContractId] = useState<string>(DEFAULT_CONTRACT);
  const [functionName, setFunctionName] = useState<string>("swap");
  const [txHash, setTxHash] = useState<string>("a".repeat(64));
  const [warningThresholdPct, setWarningThresholdPct] = useState<string>("80");
  const [report, setReport] = useState<ResourceHeadroomReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);

  function updateNetwork(next: HeadroomNetwork) {
    generation.current += 1;
    setNetwork(next);
    setReport(null);
    setError(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const reqGen = ++generation.current;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/insights/resource-headroom", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode,
          contractId: mode === "simulation" ? contractId.trim() : undefined,
          functionName: mode === "simulation" ? functionName.trim() : undefined,
          txHash: mode === "historical" ? txHash.trim() : undefined,
          warningThresholdPct: Number(warningThresholdPct),
          network,
        }),
      });
      const payload = (await response.json()) as {
        report?: ResourceHeadroomReport;
        error?: string;
        message?: string;
      };
      if (reqGen !== generation.current) return;
      if (payload.report) {
        setReport(payload.report);
        return;
      }
      if (!response.ok) {
        throw new Error(payload.message ?? payload.error ?? `Request failed (${response.status})`);
      }
    } catch (caught) {
      if (reqGen === generation.current) {
        setError(caught instanceof Error ? caught.message : "Failed to compare resource headroom");
        setReport(null);
      }
    } finally {
      if (reqGen === generation.current) setBusy(false);
    }
  }

  return {
    network,
    setNetwork: updateNetwork,
    mode,
    setMode,
    contractId,
    setContractId,
    functionName,
    setFunctionName,
    txHash,
    setTxHash,
    warningThresholdPct,
    setWarningThresholdPct,
    report,
    error,
    busy,
    submit,
  };
}
