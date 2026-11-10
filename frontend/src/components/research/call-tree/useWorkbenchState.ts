"use client";

import { useRef, useState, type FormEvent } from "react";
import {
  SUPPORTED_CALL_TREE_NETWORKS,
  type CallTreeNetwork,
  type CallTreeNode,
  type CallTreeReport,
} from "@/server/research/call-tree";

const DEFAULT_HASH = "a".repeat(64);

export function useWorkbenchState() {
  const [network, setNetwork] = useState<CallTreeNetwork>(SUPPORTED_CALL_TREE_NETWORKS[0]);
  const [txHash, setTxHash] = useState<string>(DEFAULT_HASH);
  const [report, setReport] = useState<CallTreeReport | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);

  function updateNetwork(next: CallTreeNetwork) {
    generation.current += 1;
    setNetwork(next);
    setReport(null);
    setSelectedNodeId(null);
    setError(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const reqGen = ++generation.current;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/insights/call-tree", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ txHash: txHash.trim(), network }),
      });
      const payload = (await response.json()) as {
        report?: CallTreeReport;
        error?: string;
        message?: string;
      };
      if (reqGen !== generation.current) return;
      if (payload.report) {
        setReport(payload.report);
        setSelectedNodeId(payload.report.roots[0]?.nodeId ?? null);
        return;
      }
      if (!response.ok) {
        throw new Error(payload.message ?? payload.error ?? `Request failed (${response.status})`);
      }
    } catch (caught) {
      if (reqGen === generation.current) {
        setError(caught instanceof Error ? caught.message : "Failed to trace call tree");
        setReport(null);
      }
    } finally {
      if (reqGen === generation.current) setBusy(false);
    }
  }

  function findNode(nodes: CallTreeNode[], id: string | null): CallTreeNode | null {
    if (!id) return null;
    for (const n of nodes) {
      if (n.nodeId === id) return n;
      const found = findNode(n.children, id);
      if (found) return found;
    }
    return null;
  }

  const selectedNode = report ? findNode(report.roots, selectedNodeId) : null;

  return {
    network,
    setNetwork: updateNetwork,
    txHash,
    setTxHash,
    report,
    selectedNode,
    selectedNodeId,
    setSelectedNodeId,
    error,
    busy,
    submit,
  };
}
