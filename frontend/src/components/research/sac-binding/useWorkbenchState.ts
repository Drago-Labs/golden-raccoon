"use client";

import { useRef, useState, type FormEvent } from "react";
import {
  SUPPORTED_SAC_NETWORKS,
  type SacBindingReport,
  type SacNetwork,
} from "@/server/research/sac-binding";

const DEFAULT_ASSET = "USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";

export function useWorkbenchState() {
  const [network, setNetwork] = useState<SacNetwork>(SUPPORTED_SAC_NETWORKS[0]);
  const [asset, setAsset] = useState<string>(DEFAULT_ASSET);
  const [contractId, setContractId] = useState<string>("");
  const [report, setReport] = useState<SacBindingReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);

  function updateNetwork(next: SacNetwork) {
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
      const response = await fetch("/api/insights/sac-binding", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          asset: asset.trim() || undefined,
          contractId: contractId.trim() || undefined,
          network,
        }),
      });
      const payload = (await response.json()) as {
        report?: SacBindingReport;
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
        setError(caught instanceof Error ? caught.message : "Failed to verify SAC binding");
        setReport(null);
      }
    } finally {
      if (reqGen === generation.current) setBusy(false);
    }
  }

  return {
    network,
    setNetwork: updateNetwork,
    asset,
    setAsset,
    contractId,
    setContractId,
    report,
    error,
    busy,
    submit,
  };
}
