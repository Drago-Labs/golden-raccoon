"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { PoolHistoryReport } from "@/server/research/soroban-pool-history/schema";
import { CoverageNotice } from "./CoverageNotice";
import { DriftNotice } from "./DriftNotice";
import { LargeTradeList } from "./LargeTradeList";
import { PoolInput } from "./PoolInput";
import { RangeSelector } from "./RangeSelector";
import { ReserveChart } from "./ReserveChart";
import { useWorkbenchState } from "./useWorkbenchState";

type Network = "stellar-testnet" | "stellar-pubnet";

export function PoolHistory({ initialNetwork = "stellar-testnet" }: { initialNetwork?: Network }) {
  const [poolId, setPoolId] = useState("");
  const [network, setNetwork] = useState<Network>(initialNetwork);
  const [fromLedger, setFromLedger] = useState("10");
  const [toLedger, setToLedger] = useState("100");
  const networkRef = useRef(network);
  const { view, setView } = useWorkbenchState(network);

  useEffect(() => {
    networkRef.current = network;
  }, [network]);

  async function reconstruct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submittedNetwork = network;
    setView({ status: "loading" });
    const response = await fetch("/api/insights/soroban-pool-history", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        poolId,
        network: submittedNetwork,
        fromLedger: Number(fromLedger),
        toLedger: Number(toLedger),
      }),
    });
    const body = (await response.json()) as { report?: PoolHistoryReport; message?: string; error?: string };
    if (networkRef.current !== submittedNetwork) return;
    if (!body.report) {
      setView({ status: "error", message: body.message ?? body.error ?? "Pool history failed." });
      return;
    }
    setView({ status: "ready", report: body.report });
  }

  return (
    <div className="flex flex-col gap-4">
      <form
        aria-label="Soroban pool history"
        className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/4 p-4"
        onSubmit={reconstruct}
      >
        <PoolInput
          poolId={poolId}
          network={network}
          disabled={view.status === "loading"}
          onPoolId={setPoolId}
          onNetwork={(value) => setNetwork(value as Network)}
        />
        <RangeSelector
          fromLedger={fromLedger}
          toLedger={toLedger}
          disabled={view.status === "loading"}
          onFrom={setFromLedger}
          onTo={setToLedger}
        />
        <button
          type="submit"
          disabled={view.status === "loading"}
          className="inline-flex w-fit rounded-full border border-[#d9a441]/35 bg-[#d9a441]/10 px-4 py-2 text-sm font-semibold text-[#f2c86d] disabled:opacity-50"
        >
          Reconstruct reserves
        </button>
        <p data-testid="pool-history-idle" className="text-sm text-muted">
          This page rebuilds pool reserves from contract events and checks them against storage. It does not trade,
          route, or predict prices.
        </p>
      </form>
      {view.status === "error" ? (
        <p role="alert" className="rounded-2xl border border-red-300/25 bg-red-400/8 p-4 text-sm text-red-100">
          {view.message}
        </p>
      ) : null}
      {view.status === "ready" ? (
        <div className="flex flex-col gap-4">
          {view.report.state === "unsupported" ? (
            <CoverageNotice notice={view.report.coverageNotice} state={view.report.state} />
          ) : (
            <>
              <ReserveChart report={view.report} />
              <LargeTradeList trades={view.report.largeTrades} network={view.report.network} />
              <DriftNotice notice={view.report.driftNotice} matched={view.report.drift?.matched ?? null} />
              <CoverageNotice notice={view.report.coverageNotice} state={view.report.state} />
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
