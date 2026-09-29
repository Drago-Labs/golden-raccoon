"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Orbit } from "lucide-react";
import { useWalletSession } from "@/hooks/useWalletSession";
import { isE2eTestMode, readE2eWalletOverride } from "@/lib/e2e/browserWallet";
import type { ReservePlannerResult, ReserveScenario } from "@/server/research/reserve-planner/schema";
import { AccountReserveSummary } from "./AccountReserveSummary";
import { ObligationTable } from "./ObligationTable";
import { PlannerStateNotice } from "./PlannerStateNotice";
import { ScenarioEditor } from "./ScenarioEditor";
import { SponsorshipPanel } from "./SponsorshipPanel";

export function ReservePlanner() {
  const wallet = useWalletSession();
  const testWallet = isE2eTestMode() ? readE2eWalletOverride() : null;
  const stellarTestWallet = testWallet?.family === "stellar" ? testWallet : null;
  const address = wallet.family === "stellar" ? wallet.address ?? stellarTestWallet?.address : stellarTestWallet?.address;
  const walletNetwork = wallet.family === "stellar" ? wallet.stellar.network ?? stellarTestWallet?.network : stellarTestWallet?.network;
  const [network, setNetwork] = useState<"stellar-testnet" | "stellar-pubnet">(walletNetwork ?? "stellar-testnet");
  const [fee, setFee] = useState("100000");
  const [scenario, setScenario] = useState<ReserveScenario>({ action: "none", count: 1 });
  const [view, setView] = useState<{ scope: string; result: ReservePlannerResult | null; error: string | null; busy: boolean }>({ scope: "", result: null, error: null, busy: false });
  const generation = useRef(0);
  const scope = `${address ?? "disconnected"}:${network}`;
  useEffect(() => { generation.current += 1; }, [address]);
  const result = view.scope === scope ? view.result : null;
  const error = view.scope === scope ? view.error : null;
  const busy = view.scope === scope && view.busy;
  const connected = Boolean(address && ((wallet.family === "stellar" && wallet.isConnected) || stellarTestWallet));
  const mismatch = Boolean(walletNetwork && walletNetwork !== network);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!address || !walletNetwork || mismatch) return;
    const requestGeneration = ++generation.current;
    setView({ scope, result: null, error: null, busy: true });
    try {
      const response = await fetch("/api/insights/reserve-planner", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ walletAddress: address, network, walletNetwork, feeAllowanceStroops: fee, scenario }) });
      const payload = await response.json() as ReservePlannerResult & { error?: string };
      if (requestGeneration !== generation.current) return;
      if (!response.ok && payload.state !== "unavailable") throw new Error(payload.error ?? `Reserve request failed (${response.status})`);
      if (payload.walletAddress !== address || payload.network !== network) return;
      setView({ scope, result: payload, error: null, busy: false });
    } catch (caught) {
      if (requestGeneration === generation.current) setView({ scope, result: null, error: caught instanceof Error ? caught.message : "Reserve planner unavailable", busy: false });
    }
  }

  return <div className="space-y-6"><header className="flex items-start gap-4 border-b border-white/10 pb-5"><div className="rounded-2xl border border-[#d9a441]/35 bg-[#d9a441]/10 p-3 text-[#f2c86d]"><Orbit aria-hidden className="h-6 w-6" /></div><div><div className="text-xs uppercase tracking-[0.18em] text-[#d9a441]">Stellar insight</div><h1 className="mt-1 text-3xl font-semibold">Reserve and sponsorship planner</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">Explain locked and spendable XLM at one observed ledger, then preview bounded counter changes without creating a transaction.</p></div></header><PlannerStateNotice result={result} error={error} connected={connected} /><ScenarioEditor network={network} fee={fee} scenario={scenario} busy={busy || !connected} mismatch={mismatch} onNetwork={(value) => { generation.current += 1; setNetwork(value); }} onFee={setFee} onScenario={setScenario} onSubmit={submit} /><div aria-live="polite" className="sr-only">{busy ? "Reserve planner loading" : result ? `Reserve planner ${result.state}` : error ?? ""}</div>{result?.before && result.after && result.beforeCounters && result.afterCounters ? <><AccountReserveSummary breakdown={result.before} ledger={result.observation.ledger} source={result.observation.source} /><ObligationTable before={result.before} after={result.after} /><SponsorshipPanel before={result.beforeCounters} after={result.afterCounters} /></> : null}</div>;
}
