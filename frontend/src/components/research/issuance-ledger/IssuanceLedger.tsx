"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { IssuanceReport } from "@/server/research/issuance-ledger/schema";
import { AssetInput } from "./AssetInput";
import { CoverageNotice } from "./CoverageNotice";
import { OperationLedger } from "./OperationLedger";
import { ReconciliationTable } from "./ReconciliationTable";
import { SupplyChart } from "./SupplyChart";
import { useWorkbenchState } from "./useWorkbenchState";

type Network = "stellar-testnet" | "stellar-pubnet";

export function IssuanceLedger({ initialNetwork = "stellar-testnet" }: { initialNetwork?: Network }) {
  const [assetCode, setAssetCode] = useState("");
  const [issuer, setIssuer] = useState("");
  const [network, setNetwork] = useState<Network>(initialNetwork);
  const [fromLedger, setFromLedger] = useState("10");
  const [toLedger, setToLedger] = useState("20");
  const networkRef = useRef(network);
  const { view, setView } = useWorkbenchState(network);

  useEffect(() => {
    networkRef.current = network;
  }, [network]);

  async function reconcile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submittedNetwork = network;
    setView({ status: "loading" });
    const response = await fetch("/api/insights/issuance-ledger", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        assetCode,
        issuer,
        network: submittedNetwork,
        fromLedger: Number(fromLedger),
        toLedger: Number(toLedger),
      }),
    });
    const body = (await response.json()) as { report?: IssuanceReport; message?: string; error?: string };
    if (networkRef.current !== submittedNetwork) return;
    if (!body.report) {
      setView({ status: "error", message: body.message ?? body.error ?? "Issuance ledger failed." });
      return;
    }
    setView({ status: "ready", report: body.report });
  }

  return (
    <div className="flex flex-col gap-4">
      <form
        aria-label="Issuance ledger"
        className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/4 p-4"
        onSubmit={reconcile}
      >
        <AssetInput
          assetCode={assetCode}
          issuer={issuer}
          network={network}
          fromLedger={fromLedger}
          toLedger={toLedger}
          disabled={view.status === "loading"}
          onAssetCode={setAssetCode}
          onIssuer={setIssuer}
          onNetwork={setNetwork}
          onFrom={setFromLedger}
          onTo={setToLedger}
        />
        <button
          type="submit"
          disabled={view.status === "loading"}
          className="inline-flex w-fit rounded-full border border-[#d9a441]/35 bg-[#d9a441]/10 px-4 py-2 text-sm font-semibold text-[#f2c86d] disabled:opacity-50"
        >
          Reconcile supply
        </button>
        <p data-testid="issuance-idle" className="text-sm text-muted">
          This page rebuilds outstanding supply from issuer mints and burns. It does not assert misconduct or change a risk
          score.
        </p>
      </form>
      {view.status === "error" ? (
        <p role="alert" className="rounded-2xl border border-red-300/25 bg-red-400/8 p-4 text-sm text-red-100">
          {view.message}
        </p>
      ) : null}
      {view.status === "ready" ? (
        <div className="flex flex-col gap-4">
          <ReconciliationTable report={view.report} />
          <SupplyChart report={view.report} />
          <OperationLedger operations={view.report.operations} />
          <CoverageNotice notice={view.report.coverageNotice} state={view.report.state} />
        </div>
      ) : null}
    </div>
  );
}
