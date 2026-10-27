"use client";
import { useState, type FormEvent } from "react";
import { CoverageNotice } from "./CoverageNotice";
import { ExcludedAddressTable } from "./ExcludedAddressTable";
import { ReportedComparison } from "./ReportedComparison";
import { SupplyWaterfall } from "./SupplyWaterfall";
import { TokenInput } from "./TokenInput";
import { useWorkbenchState } from "./useWorkbenchState";
export function SupplyReconciliation() {
  const [token, setToken] = useState(""); const [state, setState] = useWorkbenchState();
  async function submit(event: FormEvent) { event.preventDefault(); setState({ status: "loading" }); const response = await fetch("/api/insights/circulating-supply", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: { network: "evm", chainId: 1, address: token, decimals: 18 }, exclusions: [], reportedSources: [] }) }); const body = await response.json() as { report?: import("@/server/research/circulating-supply/schema").CirculatingSupplyReport; message?: string }; setState(body.report ? { status: "ready", report: body.report } : { status: "error", message: body.message ?? "Reconciliation failed." }); }
  return <div className="grid gap-4"><form aria-label="Circulating supply reconciliation" onSubmit={submit} className="grid gap-4 rounded-xl border border-white/10 p-4"><TokenInput value={token} onChange={setToken} /><button disabled={state.status === "loading"} className="w-fit rounded-full border px-4 py-2">Reconcile supply</button><p className="text-sm">Read-only: no transaction is created or signed.</p></form>{state.status === "error" ? <p role="alert">{state.message}</p> : null}{state.status === "ready" ? <div className="grid gap-4"><SupplyWaterfall report={state.report} /><ExcludedAddressTable rows={state.report.exclusions} /><ReportedComparison rows={state.report.comparisons} /><CoverageNotice notice={state.report.coverageNotice} /></div> : null}</div>;
}
