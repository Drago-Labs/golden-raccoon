import type { FormEvent } from "react";
import { SUPPORTED_EVENT_NETWORKS, type EventDecoderNetwork } from "@/server/research/event-decoder";

export function ContractInput(props: {
  network: EventDecoderNetwork;
  onNetworkChange: (v: EventDecoderNetwork) => void;
  contractId: string;
  onContractIdChange: (v: string) => void;
  startLedger: string;
  onStartLedgerChange: (v: string) => void;
  endLedger: string;
  onEndLedgerChange: (v: string) => void;
  busy: boolean;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form
      aria-label="Contract event query input"
      onSubmit={props.onSubmit}
      className="space-y-4 rounded-lg border border-white/10 p-4"
    >
      <div className="grid gap-3 sm:grid-cols-4">
        <label className="flex flex-col gap-1 text-xs">
          <span>Network</span>
          <select
            aria-label="Network"
            value={props.network}
            onChange={(e) => props.onNetworkChange(e.target.value as EventDecoderNetwork)}
            className="rounded border border-white/15 bg-black/40 px-2 py-1.5"
          >
            {SUPPORTED_EVENT_NETWORKS.map((net) => (
              <option key={net} value={net}>
                {net}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span>Contract ID</span>
          <input
            aria-label="Contract ID"
            value={props.contractId}
            onChange={(e) => props.onContractIdChange(e.target.value)}
            className="rounded border border-white/15 bg-black/40 px-2 py-1.5 font-mono"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span>Start ledger</span>
          <input
            aria-label="Start ledger"
            value={props.startLedger}
            onChange={(e) => props.onStartLedgerChange(e.target.value)}
            className="rounded border border-white/15 bg-black/40 px-2 py-1.5 font-mono"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span>End ledger</span>
          <input
            aria-label="End ledger"
            value={props.endLedger}
            onChange={(e) => props.onEndLedgerChange(e.target.value)}
            className="rounded border border-white/15 bg-black/40 px-2 py-1.5 font-mono"
          />
        </label>
      </div>
      <button
        type="submit"
        disabled={props.busy}
        className="rounded bg-white/90 px-4 py-2 text-xs font-semibold text-black disabled:opacity-40"
      >
        Decode contract events
      </button>
    </form>
  );
}
