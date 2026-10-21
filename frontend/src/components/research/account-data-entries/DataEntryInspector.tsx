"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { DataEntryReport } from "@/server/research/account-data-entries/schema";
import { AccountInput } from "./AccountInput";
import { CoverageNotice } from "./CoverageNotice";
import { DecodedValuePanel } from "./DecodedValuePanel";
import { EntryHistory } from "./EntryHistory";
import { EntryTable } from "./EntryTable";
import { useWorkbenchState } from "./useWorkbenchState";

type Network = "stellar-testnet" | "stellar-pubnet";

export function DataEntryInspector({ initialNetwork = "stellar-testnet" }: { initialNetwork?: Network }) {
  const [account, setAccount] = useState("");
  const [network, setNetwork] = useState<Network>(initialNetwork);
  const [recentWindowLedgers, setRecentWindowLedgers] = useState("30");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const networkRef = useRef(network);
  const { view, setView } = useWorkbenchState(network);

  useEffect(() => {
    networkRef.current = network;
  }, [network]);

  async function inspect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submittedNetwork = network;
    setView({ status: "loading" });
    const response = await fetch("/api/insights/account-data-entries", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ account, network: submittedNetwork, recentWindowLedgers: Number(recentWindowLedgers) }),
    });
    const body = (await response.json()) as { report?: DataEntryReport; message?: string; error?: string };
    if (networkRef.current !== submittedNetwork) return;
    if (!body.report) {
      setView({ status: "error", message: body.message ?? body.error ?? "Inspection failed." });
      return;
    }
    setSelectedKey(body.report.entries[0]?.key ?? null);
    setView({ status: "ready", report: body.report });
  }

  const selected = view.status === "ready" ? view.report.entries.find((entry) => entry.key === selectedKey) ?? null : null;

  return (
    <div className="flex flex-col gap-4">
      <form aria-label="Account data entries" className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/4 p-4" onSubmit={inspect}>
        <AccountInput
          account={account}
          network={network}
          recentWindowLedgers={recentWindowLedgers}
          disabled={view.status === "loading"}
          onAccount={setAccount}
          onNetwork={setNetwork}
          onWindow={setRecentWindowLedgers}
        />
        <button
          type="submit"
          disabled={view.status === "loading"}
          className="inline-flex w-fit rounded-full border border-[#d9a441]/35 bg-[#d9a441]/10 px-4 py-2 text-sm font-semibold text-[#f2c86d] disabled:opacity-50"
        >
          Inspect data entries
        </button>
        <p data-testid="data-entry-idle" className="text-sm text-muted">
          This page only reads account data. It does not write entries or sign a transaction.
        </p>
      </form>
      {view.status === "error" ? (
        <p role="alert" className="rounded-2xl border border-red-300/25 bg-red-400/8 p-4 text-sm text-red-100">
          {view.message}
        </p>
      ) : null}
      {view.status === "ready" && selected ? (
        <div className="flex flex-col gap-4">
          <EntryTable entries={view.report.entries} selectedKey={selected.key} onSelect={setSelectedKey} />
          <DecodedValuePanel entry={selected} />
          <EntryHistory entryKey={selected.key} events={selected.history} truncated={view.report.historyTruncated} oldestLedger={view.report.oldestLedger} />
          <CoverageNotice notice={view.report.coverageNotice} state={view.report.state} reserveTotalXlm={view.report.reserveTotalXlm} />
        </div>
      ) : null}
      {view.status === "ready" && !selected ? (
        <CoverageNotice notice={view.report.coverageNotice} state={view.report.state} reserveTotalXlm={view.report.reserveTotalXlm} />
      ) : null}
    </div>
  );
}
