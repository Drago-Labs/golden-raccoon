"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { InvocationProfileReport } from "@/server/research/invocation-profile/schema";
import { CallerTable } from "./CallerTable";
import { ContractInput } from "./ContractInput";
import { CoverageNotice } from "./CoverageNotice";
import { FunctionTable } from "./FunctionTable";
import { UsageChart } from "./UsageChart";
import { useWorkbenchState } from "./useWorkbenchState";

type Network = "stellar-testnet" | "stellar-pubnet";

export function InvocationProfile({ initialNetwork = "stellar-testnet" }: { initialNetwork?: Network }) {
  const [contractId, setContractId] = useState("");
  const [network, setNetwork] = useState<Network>(initialNetwork);
  const [windowStart, setWindowStart] = useState("1000");
  const [windowEnd, setWindowEnd] = useState("2000");
  const networkRef = useRef(network);
  const { view, setView } = useWorkbenchState(network);

  useEffect(() => {
    networkRef.current = network;
  }, [network]);

  async function profile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submittedNetwork = network;
    setView({ status: "loading" });

    const response = await fetch("/api/insights/invocation-profile", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contractId,
        network: submittedNetwork,
        windowStart: Number(windowStart),
        windowEnd: Number(windowEnd),
      }),
    });

    const body = (await response.json()) as { report?: InvocationProfileReport; message?: string; error?: string };
    if (networkRef.current !== submittedNetwork) return;

    if (!body.report) {
      setView({ status: "error", message: body.message ?? body.error ?? "Profile failed." });
      return;
    }

    setView({ status: "ready", report: body.report });
  }

  return (
    <div className="flex flex-col gap-4">
      <form
        aria-label="Invocation profile"
        className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/4 p-4"
        onSubmit={profile}
      >
        <ContractInput
          contractId={contractId}
          network={network}
          windowStart={windowStart}
          windowEnd={windowEnd}
          disabled={view.status === "loading"}
          onContractId={setContractId}
          onNetwork={(value) => setNetwork(value as Network)}
          onWindowStart={setWindowStart}
          onWindowEnd={setWindowEnd}
        />
        <button
          type="submit"
          disabled={view.status === "loading"}
          className="inline-flex w-fit rounded-full border border-[#d9a441]/35 bg-[#d9a441]/10 px-4 py-2 text-sm font-semibold text-[#f2c86d] disabled:opacity-50"
        >
          Profile invocations
        </button>
        <p data-testid="invocation-profile-idle" className="text-sm text-muted">
          Read-only profile of who calls a Soroban contract and which functions they use. Does not identify real-world
          operators.
        </p>
      </form>

      {view.status === "error" ? (
        <p role="alert" className="rounded-2xl border border-red-300/25 bg-red-400/8 p-4 text-sm text-red-100">
          {view.message}
        </p>
      ) : null}

      {view.status === "ready" ? (
        <div className="flex flex-col gap-4">
          <section aria-label="Function table">
            <h2 className="mb-2 text-lg font-semibold">Functions</h2>
            <FunctionTable functions={view.report.functions} />
          </section>
          <section aria-label="Caller table">
            <h2 className="mb-2 text-lg font-semibold">Callers</h2>
            <CallerTable callers={view.report.callers} />
          </section>
          <UsageChart daily={view.report.daily} />
          <p className="text-sm text-muted">
            Concentration: top caller share {(view.report.concentration.topCallerShare * 100).toFixed(1)}% · new{" "}
            {view.report.cohorts.newCallers} / returning {view.report.cohorts.returningCallers}
          </p>
          <CoverageNotice notice={view.report.coverageNotice} state={view.report.state} />
        </div>
      ) : null}
    </div>
  );
}
