"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { PoolReturnsReport } from "@/server/research/pool-share-returns/schema";
import { CoverageNotice } from "./CoverageNotice";
import { PositionInput } from "./PositionInput";
import { ReturnBreakdownChart } from "./ReturnBreakdownChart";
import { ReturnTable } from "./ReturnTable";
import { useWorkbenchState } from "./useWorkbenchState";
import { WindowSelector } from "./WindowSelector";

type Network = "stellar-testnet" | "stellar-pubnet";

export function PoolReturnsReport({ initialNetwork = "stellar-testnet" }: { initialNetwork?: Network }) {
  const [account, setAccount] = useState("");
  const [poolId, setPoolId] = useState("");
  const [network, setNetwork] = useState<Network>(initialNetwork);
  const [windowStart, setWindowStart] = useState("10");
  const [windowEnd, setWindowEnd] = useState("100");
  const networkRef = useRef(network);
  const { view, setView } = useWorkbenchState(network);

  useEffect(() => {
    networkRef.current = network;
  }, [network]);

  async function calculate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submittedNetwork = network;
    setView({ status: "loading" });

    const response = await fetch("/api/insights/pool-share-returns", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        account,
        poolId,
        network: submittedNetwork,
        windowStart: Number(windowStart),
        windowEnd: Number(windowEnd),
      }),
    });

    const body = (await response.json()) as { report?: PoolReturnsReport; message?: string; error?: string };
    if (networkRef.current !== submittedNetwork) return;

    if (!body.report) {
      setView({ status: "error", message: body.message ?? body.error ?? "Calculation failed." });
      return;
    }

    setView({ status: "ready", report: body.report });
  }

  return (
    <div className="flex flex-col gap-4">
      <form
        aria-label="Pool returns calculator"
        className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/4 p-4"
        onSubmit={calculate}
      >
        <PositionInput
          account={account}
          poolId={poolId}
          network={network}
          disabled={view.status === "loading"}
          onAccount={setAccount}
          onPoolId={setPoolId}
          onNetwork={setNetwork}
        />
        <WindowSelector
          windowStart={windowStart}
          windowEnd={windowEnd}
          disabled={view.status === "loading"}
          onStart={setWindowStart}
          onEnd={setWindowEnd}
        />
        <button
          type="submit"
          disabled={view.status === "loading"}
          className="inline-flex w-fit rounded-full border border-[#d9a441]/35 bg-[#d9a441]/10 px-4 py-2 text-sm font-semibold text-[#f2c86d] disabled:opacity-50"
        >
          Calculate returns
        </button>
        <p data-testid="pool-returns-idle" className="text-sm text-muted">
          This page compares LP fee income with divergence loss. It does not build transactions or recommend entry or exit.
        </p>
      </form>
      {view.status === "error" ? (
        <p role="alert" className="rounded-2xl border border-red-300/25 bg-red-400/8 p-4 text-sm text-red-100">
          {view.message}
        </p>
      ) : null}
      {view.status === "ready" && view.report.breakdown ? (
        <div className="flex flex-col gap-4">
          <ReturnBreakdownChart breakdown={view.report.breakdown} />
          <ReturnTable breakdown={view.report.breakdown} />
          <CoverageNotice notice={view.report.coverageNotice} state={view.report.state} />
        </div>
      ) : null}
    </div>
  );
}
