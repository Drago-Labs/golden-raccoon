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

export function VaultInput(props: {
  connected: boolean;
  network: string;
  onNetwork(value: string): void;
  vaultAddress: string;
  onVaultAddress(value: string): void;
  blockNumber: string;
  onBlockNumber(value: string): void;
  sampleAmounts: string[];
  sampleDraft: string;
  onSampleDraft(value: string): void;
  onAddSample(): void;
  onRemoveSample(index: number): void;
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
          <span>Vault address</span>
          <input
            value={props.vaultAddress}
            onChange={(event) => props.onVaultAddress(event.target.value)}
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
        <legend className="px-1 text-sm font-medium">
          Sample deposit amounts to check for rounding (in the asset&apos;s smallest unit)
        </legend>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs">
            <span>Amount</span>
            <input
              value={props.sampleDraft}
              onChange={(event) => props.onSampleDraft(event.target.value)}
              inputMode="numeric"
              placeholder="e.g. 1000000"
              className="rounded-lg border border-white/15 bg-transparent p-2 font-mono"
            />
          </label>
          <button
            type="button"
            onClick={props.onAddSample}
            className="rounded-lg border border-white/20 px-3 py-2 text-xs"
          >
            Add
          </button>
        </div>
        {props.sampleAmounts.length > 0 && (
          <ul className="space-y-1 text-xs text-white/70">
            {props.sampleAmounts.map((amount, index) => (
              <li key={`${amount}-${index}`} className="flex items-center justify-between gap-2">
                <span className="font-mono">{amount}</span>
                <button type="button" onClick={() => props.onRemoveSample(index)} className="underline underline-offset-2">
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
        {props.busy ? "Reading…" : "Read vault accounting"}
      </button>
    </form>
  );
}
