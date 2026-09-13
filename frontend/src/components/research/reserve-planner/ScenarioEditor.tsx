import type { FormEvent } from "react";
import type { ReserveScenario } from "@/server/research/reserve-planner/schema";

type StellarNetwork = "stellar-testnet" | "stellar-pubnet";
type Props = { network: StellarNetwork; fee: string; scenario: ReserveScenario; busy: boolean; mismatch: boolean; onNetwork: (value: StellarNetwork) => void; onFee: (value: string) => void; onScenario: (value: ReserveScenario) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void };
const field = "h-11 w-full rounded-xl border border-white/15 bg-black/25 px-3 text-sm outline-none focus:border-[#d9a441]";

export function ScenarioEditor(props: Props) {
  return (
    <form onSubmit={props.onSubmit} className="glass-panel space-y-4 rounded-2xl border border-white/10 p-5">
      <div><h2 className="text-lg font-semibold">Hypothetical change</h2><p className="mt-1 text-sm text-white/50">The planner changes copied counters only. It never constructs XDR or asks the wallet to sign.</p></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="space-y-1 text-xs text-white/60">Network<select value={props.network} onChange={(event) => props.onNetwork(event.target.value as StellarNetwork)} className={field}><option value="stellar-testnet">Stellar Testnet</option><option value="stellar-pubnet">Stellar Pubnet</option></select></label>
        <label className="space-y-1 text-xs text-white/60">Scenario<select value={props.scenario.action} onChange={(event) => props.onScenario({ ...props.scenario, action: event.target.value as ReserveScenario["action"] })} className={field}><option value="none">No change</option><option value="add_trustline">Add trustline</option><option value="remove_trustline">Remove trustline</option><option value="add_entry">Add account entry</option><option value="remove_entry">Remove account entry</option><option value="sponsor_entry">Sponsor entry</option><option value="end_sponsoring">End sponsoring</option><option value="receive_sponsorship">Receive sponsorship</option><option value="remove_sponsored">Remove sponsored entry</option></select></label>
        <label className="space-y-1 text-xs text-white/60">Count<input type="number" min="0" max="20" value={props.scenario.count} onChange={(event) => props.onScenario({ ...props.scenario, count: Number(event.target.value) })} className={field} /></label>
        <label className="space-y-1 text-xs text-white/60">Fee allowance (stroops)<input inputMode="numeric" pattern="[0-9]+" value={props.fee} onChange={(event) => props.onFee(event.target.value)} className={field} /></label>
      </div>
      {props.mismatch ? <div role="alert" className="text-sm text-amber-100">Selected network must match the connected Stellar wallet.</div> : null}
      <button disabled={props.busy || props.mismatch} className="rounded-full bg-[#d9a441] px-5 py-2.5 text-sm font-semibold text-black disabled:opacity-55">{props.busy ? "Reading ledger…" : "Calculate reserve plan"}</button>
    </form>
  );
}
