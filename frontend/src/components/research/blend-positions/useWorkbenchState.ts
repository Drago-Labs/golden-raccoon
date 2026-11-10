"use client";

import { useRef, useState, type FormEvent } from "react";
import {
  SUPPORTED_BLEND_NETWORKS,
  type BlendNetwork,
  type BlendPositionReport,
} from "@/server/research/blend-positions";

const DEFAULT_POOL = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM";
const DEFAULT_ACCOUNT = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

export function useWorkbenchState() {
  const [network, setNetwork] = useState<BlendNetwork>(SUPPORTED_BLEND_NETWORKS[0]);
  const [poolId, setPoolId] = useState<string>(DEFAULT_POOL);
  const [accountId, setAccountId] = useState<string>(DEFAULT_ACCOUNT);
  const [report, setReport] = useState<BlendPositionReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);

  function updateNetwork(next: BlendNetwork) {
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
      const response = await fetch("/api/insights/blend-positions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accountId: accountId.trim(), poolId: poolId.trim(), network }),
      });
      const payload = (await response.json()) as {
        report?: BlendPositionReport;
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
        setError(caught instanceof Error ? caught.message : "Failed to inspect Blend position");
        setReport(null);
      }
    } finally {
      if (reqGen === generation.current) setBusy(false);
    }
  }

  return {
    network,
    setNetwork: updateNetwork,
    poolId,
    setPoolId,
    accountId,
    setAccountId,
    report,
    error,
    busy,
    submit,
  };
}
