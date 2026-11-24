"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { CounterpartyFlowReport, WindowPreset } from "@/server/research/counterparty-flows/schema";
import { AccountInput } from "./AccountInput";
import { CoverageNotice } from "./CoverageNotice";
import { CounterpartyTable } from "./CounterpartyTable";
import { FlowChart } from "./FlowChart";
import { useWorkbenchState } from "./useWorkbenchState";
import { WindowSelector } from "./WindowSelector";

type Network = "stellar-testnet" | "stellar-pubnet";

export function CounterpartyProfile({ initialNetwork = "stellar-testnet" }: { initialNetwork?: Network }) {
  const [account, setAccount] = useState("");
  const [network, setNetwork] = useState<Network>(initialNetwork);
  const [window, setWindow] = useState<WindowPreset>("30d");
  const networkRef = useRef(network);
  const { view, setView } = useWorkbenchState(network);

  useEffect(() => {
    networkRef.current = network;
  }, [network]);

  useEffect(() => {
    setView({ status: "idle" });
  }, [network, setView]);

  async function profile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submittedNetwork = network;
    setView({ status: "loading" });

    const response = await fetch("/api/insights/counterparty-flows", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        account,
        network: submittedNetwork,
        window,
      }),
    });

    const body = (await response.json()) as { report?: CounterpartyFlowReport; message?: string; error?: string };
    if (networkRef.current !== submittedNetwork) return;

    if (!body.report) {
      setView({ status: "error", message: body.message ?? body.error ?? "Profiling failed." });
      return;
    }

    setView({ status: "ready", report: body.report });
  }

  return (
    <div className="flex flex-col gap-4">
      <form
        aria-label="Counterparty flows"
        className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/4 p-4"
        onSubmit={profile}
      >
        <AccountInput
          account={account}
          network={network}
          disabled={view.status === "loading"}
          onAccount={setAccount}
          onNetwork={(value) => setNetwork(value as Network)}
        />
        <WindowSelector window={window} disabled={view.status === "loading"} onWindow={setWindow} />
        <button
          type="submit"
          disabled={view.status === "loading"}
          className="inline-flex w-fit rounded-full border border-[#d9a441]/35 bg-[#d9a441]/10 px-4 py-2 text-sm font-semibold text-[#f2c86d] disabled:opacity-50"
        >
          Profile counterparties
        </button>
        <p data-testid="counterparty-flows-idle" className="text-sm text-muted">
          This page aggregates who an account pays and is paid by. It does not invent labels or change a risk score.
        </p>
      </form>
      {view.status === "error" ? (
        <p role="alert" className="rounded-2xl border border-red-300/25 bg-red-400/8 p-4 text-sm text-red-100">
          {view.message}
        </p>
      ) : null}
      {view.status === "ready" ? (
        <div className="flex flex-col gap-4">
          <CounterpartyTable totals={view.report.totals} />
          <FlowChart totals={view.report.totals} concentration={view.report.concentration} />
          <CoverageNotice notice={view.report.coverageNotice} state={view.report.state} />
        </div>
      ) : null}
    </div>
  );
}
