import type { FormEvent } from "react";
import { SUPPORTED_NETWORKS } from "./useWorkbenchState";

export function WalletWindowInput(props: {
  connected: boolean;
  network: string;
  onNetworkChange: (v: string) => void;
  windowDays: string;
  onWindowDaysChange: (v: string) => void;
  clusterThreshold: string;
  onClusterThresholdChange: (v: string) => void;
  busy: boolean;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form onSubmit={props.onSubmit} className="space-y-4 rounded-lg border border-white/10 p-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-xs">
          <span>Network</span>
          <select
            aria-label="Network"
            value={props.network}
            onChange={(e) => props.onNetworkChange(e.target.value)}
            className="rounded border border-white/15 bg-black/40 px-2 py-1.5"
          >
            {SUPPORTED_NETWORKS.map((net) => (
              <option key={net} value={net}>
                {net}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span>Window (days)</span>
          <input
            aria-label="Window (days)"
            value={props.windowDays}
            onChange={(e) => props.onWindowDaysChange(e.target.value)}
            className="rounded border border-white/15 bg-black/40 px-2 py-1.5"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span>Cluster threshold</span>
          <input
            aria-label="Cluster threshold"
            value={props.clusterThreshold}
            onChange={(e) => props.onClusterThresholdChange(e.target.value)}
            className="rounded border border-white/15 bg-black/40 px-2 py-1.5"
          />
        </label>
      </div>
      <button
        type="submit"
        disabled={!props.connected || props.busy}
        className="rounded bg-white/90 px-4 py-2 text-xs font-semibold text-black disabled:opacity-40"
      >
        Measure holding correlation
      </button>
    </form>
  );
}
