"use client";

import { useRef, useState, type FormEvent } from "react";
import {
  SUPPORTED_EVENT_NETWORKS,
  type EventDecoderNetwork,
  type EventDecoderReport,
} from "@/server/research/event-decoder";

const DEFAULT_CONTRACT = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM";

export function useWorkbenchState() {
  const [network, setNetwork] = useState<EventDecoderNetwork>(SUPPORTED_EVENT_NETWORKS[0]);
  const [contractId, setContractId] = useState<string>(DEFAULT_CONTRACT);
  const [startLedger, setStartLedger] = useState<string>("900000");
  const [endLedger, setEndLedger] = useState<string>("900500");
  const [topicFilter, setTopicFilter] = useState<string>("");
  const [showRaw, setShowRaw] = useState<boolean>(false);
  const [report, setReport] = useState<EventDecoderReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);

  function updateNetwork(next: EventDecoderNetwork) {
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
      const response = await fetch("/api/insights/event-decoder", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contractId: contractId.trim(),
          startLedger: Number(startLedger),
          endLedger: Number(endLedger),
          topicFilter: topicFilter.trim() || undefined,
          network,
        }),
      });
      const payload = (await response.json()) as {
        report?: EventDecoderReport;
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
        setError(caught instanceof Error ? caught.message : "Failed to decode contract events");
        setReport(null);
      }
    } finally {
      if (reqGen === generation.current) setBusy(false);
    }
  }

  return {
    network,
    setNetwork: updateNetwork,
    contractId,
    setContractId,
    startLedger,
    setStartLedger,
    endLedger,
    setEndLedger,
    topicFilter,
    setTopicFilter,
    showRaw,
    setShowRaw,
    report,
    error,
    busy,
    submit,
  };
}
