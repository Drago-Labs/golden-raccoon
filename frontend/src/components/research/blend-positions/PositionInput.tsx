import type { FormEvent } from "react";
import { SUPPORTED_BLEND_NETWORKS, type BlendNetwork } from "@/server/research/blend-positions";

export function PositionInput(props: {
  network: BlendNetwork;
  onNetworkChange: (v: BlendNetwork) => void;
  poolId: string;
  onPoolIdChange: (v: string) => void;
  accountId: string;
  onAccountIdChange: (v: string) => void;
  busy: boolean;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form
      aria-label="Blend pool position input"
      onSubmit={props.onSubmit}
      className="space-y-4 rounded-lg border border-white/10 p-4"
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-xs">
          <span>Network</span>
          <select
            aria-label="Network"
            value={props.network}
            onChange={(e) => props.onNetworkChange(e.target.value as BlendNetwork)}
            className="rounded border border-white/15 bg-black/40 px-2 py-1.5"
          >
            {SUPPORTED_BLEND_NETWORKS.map((net) => (
              <option key={net} value={net}>
                {net}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span>Pool contract ID</span>
          <input
            aria-label="Pool contract ID"
            value={props.poolId}
            onChange={(e) => props.onPoolIdChange(e.target.value)}
            className="rounded border border-white/15 bg-black/40 px-2 py-1.5 font-mono"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span>Account ID</span>
          <input
            aria-label="Account ID"
            value={props.accountId}
            onChange={(e) => props.onAccountIdChange(e.target.value)}
            className="rounded border border-white/15 bg-black/40 px-2 py-1.5 font-mono"
          />
        </label>
      </div>
      <button
        type="submit"
        disabled={props.busy}
        className="rounded bg-white/90 px-4 py-2 text-xs font-semibold text-black disabled:opacity-40"
      >
        Inspect Blend position
      </button>
    </form>
  );
}
