"use client";
import { useState, type FormEvent } from "react";
import { AddressInput } from "./AddressInput";
import { CapabilitySummary } from "./CapabilitySummary";
import { CoverageNotice } from "./CoverageNotice";
import { DelegationStatus } from "./DelegationStatus";
import { HistoryTable } from "./HistoryTable";
import { useWorkbenchState } from "./useWorkbenchState";
import type { DelegationReport } from "@/server/research/eoa-delegation";

export function DelegationInspector() {
  const [address, setAddress] = useState(""); const [network, setNetwork] = useState("ethereum");
  const state = useWorkbenchState();
  async function submit(event: FormEvent) { event.preventDefault(); state.setLoading(true); state.setError(null); try { const response = await fetch("/api/insights/eoa-delegation", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address, network }) }); const body = await response.json() as DelegationReport & { error?: string }; if (!response.ok) throw new Error(body.error ?? "Inspection failed"); state.setResult(body); } catch (error) { state.setError(error instanceof Error ? error.message : "Inspection failed"); } finally { state.setLoading(false); } }
  return <div className="space-y-6"><header><p className="text-xs uppercase tracking-widest text-[#d9a441]">Security insight</p><h1 className="text-3xl font-semibold">EIP-7702 delegation inspector</h1><p className="mt-2 text-sm text-white/60">Read-only inspection of installed delegation code, authorization history, and account capabilities.</p></header><form onSubmit={submit} className="grid gap-4 rounded-xl border border-white/10 p-5 sm:grid-cols-2"><AddressInput value={address} onChange={setAddress} /><label className="flex flex-col gap-1 text-sm"><span>Network</span><select value={network} onChange={(e) => setNetwork(e.target.value)} className="rounded-lg border border-white/15 bg-transparent p-2"><option value="ethereum">Ethereum</option><option value="base">Base</option><option value="optimism">Optimism</option><option value="arbitrum">Arbitrum</option></select></label><button disabled={state.loading} className="rounded-lg border border-[#d9a441]/40 px-4 py-2 text-[#f2c86d] sm:col-span-2">{state.loading ? "Inspecting…" : "Inspect delegation"}</button></form><div aria-live="polite" className="sr-only">{state.loading ? "Inspection loading" : state.error ?? state.result?.state}</div>{state.error && <p role="alert">{state.error}</p>}{state.result && <div className="space-y-5 rounded-xl border border-white/10 p-5"><DelegationStatus report={state.result} /><CapabilitySummary capabilities={state.result.capabilities} /><HistoryTable rows={state.result.history} /><CoverageNotice items={state.result.coverage} /></div>}</div>;
}
