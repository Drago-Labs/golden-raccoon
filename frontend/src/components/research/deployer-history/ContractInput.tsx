"use client";

import type { FormEvent } from "react";
import { SUPPORTED_NETWORKS } from "./useWorkbenchState";

const NETWORK_LABELS: Record<string, string> = {
  ethereum: "Ethereum",
  base: "Base",
  arbitrum: "Arbitrum",
  polygon: "Polygon",
  optimism: "Optimism",
  bsc: "BNB Chain",
  avalanche: "Avalanche",
};

export function ContractInput(props: {
  connected: boolean;
  network: string;
  onNetwork(value: string): void;
  contractAddress: string;
  onContractAddress(value: string): void;
  busy: boolean;
  onSubmit(event: FormEvent<HTMLFormElement>): void;
}) {
  return (
    <form onSubmit={props.onSubmit} className="space-y-4 rounded-xl border border-white/10 p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span>Network</span>
          <select
            value={props.network}
            onChange={(event) => props.onNetwork(event.target.value)}
            className="rounded-lg border border-white/15 bg-transparent p-2"
          >
            {SUPPORTED_NETWORKS.map((id) => (
              <option key={id} value={id}>
                {NETWORK_LABELS[id] ?? id}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span>Contract address</span>
          <input
            value={props.contractAddress}
            onChange={(event) => props.onContractAddress(event.target.value)}
            placeholder="0x…"
            className="rounded-lg border border-white/15 bg-transparent p-2 font-mono text-xs"
          />
        </label>
      </div>

      <button
        type="submit"
        disabled={props.busy || !props.connected}
        className="rounded-lg border border-[#d9a441]/40 bg-[#d9a441]/10 px-4 py-2 text-sm font-medium text-[#f2c86d] disabled:opacity-50"
      >
        {props.busy ? "Profiling…" : "Profile deployer"}
      </button>
    </form>
  );
}
