import type { FormEvent } from "react";
import { SUPPORTED_CALL_TREE_NETWORKS, type CallTreeNetwork } from "@/server/research/call-tree";

export function TraceInput(props: {
  network: CallTreeNetwork;
  onNetworkChange: (v: CallTreeNetwork) => void;
  txHash: string;
  onTxHashChange: (v: string) => void;
  busy: boolean;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form
      aria-label="Invocation trace input"
      onSubmit={props.onSubmit}
      className="space-y-4 rounded-lg border border-white/10 p-4"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs">
          <span>Network</span>
          <select
            aria-label="Network"
            value={props.network}
            onChange={(e) => props.onNetworkChange(e.target.value as CallTreeNetwork)}
            className="rounded border border-white/15 bg-black/40 px-2 py-1.5"
          >
            {SUPPORTED_CALL_TREE_NETWORKS.map((net) => (
              <option key={net} value={net}>
                {net}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span>Transaction hash</span>
          <input
            aria-label="Transaction hash"
            value={props.txHash}
            onChange={(e) => props.onTxHashChange(e.target.value)}
            className="rounded border border-white/15 bg-black/40 px-2 py-1.5 font-mono"
          />
        </label>
      </div>
      <button
        type="submit"
        disabled={props.busy}
        className="rounded bg-white/90 px-4 py-2 text-xs font-semibold text-black disabled:opacity-40"
      >
        Trace call tree
      </button>
    </form>
  );
}
