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

export function CollectionInput(props: {
  connected: boolean;
  network: string;
  onNetwork(value: string): void;
  contractAddress: string;
  onContractAddress(value: string): void;
  blockNumber: string;
  onBlockNumber(value: string): void;
  tokenIds: string[];
  tokenIdDraft: string;
  onTokenIdDraft(value: string): void;
  onAddTokenId(): void;
  onRemoveTokenId(index: number): void;
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
          <span>Collection address</span>
          <input
            value={props.contractAddress}
            onChange={(event) => props.onContractAddress(event.target.value)}
            placeholder="0x…"
            className="rounded-lg border border-white/15 bg-transparent p-2 font-mono text-xs"
          />
        </label>
      </div>

      <label className="flex flex-col gap-1 text-sm sm:max-w-xs">
        <span>Block number (optional — defaults to latest)</span>
        <input
          value={props.blockNumber}
          onChange={(event) => props.onBlockNumber(event.target.value)}
          inputMode="numeric"
          placeholder="latest"
          className="rounded-lg border border-white/15 bg-transparent p-2 font-mono"
        />
      </label>

      <fieldset className="space-y-3 rounded-lg border border-white/10 p-4">
        <legend className="px-1 text-sm font-medium">Token IDs to sample (optional — defaults to 1, 2, 3)</legend>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs">
            <span>Token ID</span>
            <input
              value={props.tokenIdDraft}
              onChange={(event) => props.onTokenIdDraft(event.target.value)}
              inputMode="numeric"
              placeholder="e.g. 42"
              className="rounded-lg border border-white/15 bg-transparent p-2 font-mono"
            />
          </label>
          <button type="button" onClick={props.onAddTokenId} className="rounded-lg border border-white/20 px-3 py-2 text-xs">
            Add
          </button>
        </div>
        {props.tokenIds.length > 0 && (
          <ul className="space-y-1 text-xs text-white/70">
            {props.tokenIds.map((tokenId, index) => (
              <li key={`${tokenId}-${index}`} className="flex items-center justify-between gap-2">
                <span className="font-mono">{tokenId}</span>
                <button type="button" onClick={() => props.onRemoveTokenId(index)} className="underline underline-offset-2">
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </fieldset>

      <button
        type="submit"
        disabled={props.busy || !props.connected}
        className="rounded-lg border border-[#d9a441]/40 bg-[#d9a441]/10 px-4 py-2 text-sm font-medium text-[#f2c86d] disabled:opacity-50"
      >
        {props.busy ? "Inspecting…" : "Inspect collection"}
      </button>
    </form>
  );
}
