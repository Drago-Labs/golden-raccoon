import type { FormEvent } from "react";
import { SUPPORTED_SAC_NETWORKS, type SacNetwork } from "@/server/research/sac-binding";

export function BindingInput(props: {
  network: SacNetwork;
  onNetworkChange: (v: SacNetwork) => void;
  asset: string;
  onAssetChange: (v: string) => void;
  contractId: string;
  onContractIdChange: (v: string) => void;
  busy: boolean;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form
      aria-label="SAC binding verification input"
      onSubmit={props.onSubmit}
      className="space-y-4 rounded-lg border border-white/10 p-4"
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-xs">
          <span>Network</span>
          <select
            aria-label="Network"
            value={props.network}
            onChange={(e) => props.onNetworkChange(e.target.value as SacNetwork)}
            className="rounded border border-white/15 bg-black/40 px-2 py-1.5"
          >
            {SUPPORTED_SAC_NETWORKS.map((net) => (
              <option key={net} value={net}>
                {net}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span>Classic asset (native or CODE:ISSUER)</span>
          <input
            aria-label="Classic asset"
            value={props.asset}
            onChange={(e) => props.onAssetChange(e.target.value)}
            className="rounded border border-white/15 bg-black/40 px-2 py-1.5 font-mono"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span>Contract ID (optional counterpart)</span>
          <input
            aria-label="Contract ID"
            value={props.contractId}
            onChange={(e) => props.onContractIdChange(e.target.value)}
            className="rounded border border-white/15 bg-black/40 px-2 py-1.5 font-mono"
          />
        </label>
      </div>
      <button
        type="submit"
        disabled={props.busy}
        className="rounded bg-white/90 px-4 py-2 text-xs font-semibold text-black disabled:opacity-40"
      >
        Verify SAC binding
      </button>
    </form>
  );
}
