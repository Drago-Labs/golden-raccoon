import type { FormEvent } from "react";
import { SUPPORTED_HEADROOM_NETWORKS, type HeadroomNetwork } from "@/server/research/resource-headroom";

export function InvocationForm(props: {
  network: HeadroomNetwork;
  onNetworkChange: (v: HeadroomNetwork) => void;
  mode: "simulation" | "historical";
  onModeChange: (v: "simulation" | "historical") => void;
  contractId: string;
  onContractIdChange: (v: string) => void;
  functionName: string;
  onFunctionNameChange: (v: string) => void;
  txHash: string;
  onTxHashChange: (v: string) => void;
  warningThresholdPct: string;
  onWarningThresholdChange: (v: string) => void;
  busy: boolean;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form
      aria-label="Invocation resource analysis input"
      onSubmit={props.onSubmit}
      className="space-y-4 rounded-lg border border-white/10 p-4"
    >
      <div className="grid gap-3 sm:grid-cols-4">
        <label className="flex flex-col gap-1 text-xs">
          <span>Network</span>
          <select
            aria-label="Network"
            value={props.network}
            onChange={(e) => props.onNetworkChange(e.target.value as HeadroomNetwork)}
            className="rounded border border-white/15 bg-black/40 px-2 py-1.5"
          >
            {SUPPORTED_HEADROOM_NETWORKS.map((net) => (
              <option key={net} value={net}>
                {net}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span>Mode</span>
          <select
            aria-label="Mode"
            value={props.mode}
            onChange={(e) => props.onModeChange(e.target.value as "simulation" | "historical")}
            className="rounded border border-white/15 bg-black/40 px-2 py-1.5"
          >
            <option value="simulation">Simulate invocation</option>
            <option value="historical">Historical transaction</option>
          </select>
        </label>
        {props.mode === "simulation" ? (
          <>
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
              <span>Function name</span>
              <input
                aria-label="Function name"
                value={props.functionName}
                onChange={(e) => props.onFunctionNameChange(e.target.value)}
                className="rounded border border-white/15 bg-black/40 px-2 py-1.5 font-mono"
              />
            </label>
          </>
        ) : (
          <label className="flex flex-col gap-1 text-xs sm:col-span-2">
            <span>Transaction hash</span>
            <input
              aria-label="Transaction hash"
              value={props.txHash}
              onChange={(e) => props.onTxHashChange(e.target.value)}
              className="rounded border border-white/15 bg-black/40 px-2 py-1.5 font-mono"
            />
          </label>
        )}
      </div>
      <div className="flex items-end gap-3">
        <label className="flex flex-col gap-1 text-xs">
          <span>Warning threshold (%)</span>
          <input
            aria-label="Warning threshold (%)"
            value={props.warningThresholdPct}
            onChange={(e) => props.onWarningThresholdChange(e.target.value)}
            className="w-28 rounded border border-white/15 bg-black/40 px-2 py-1.5"
          />
        </label>
        <button
          type="submit"
          disabled={props.busy}
          className="rounded bg-white/90 px-4 py-2 text-xs font-semibold text-black disabled:opacity-40"
        >
          Compare resource headroom
        </button>
      </div>
    </form>
  );
}
