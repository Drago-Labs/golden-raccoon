"use client";

import type { FormEvent } from "react";
import { LEAF_ENCODINGS, type LeafEncoding } from "@/server/research/merkle-claims";
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

const ENCODING_LABELS: Record<LeafEncoding, string> = {
  "index-account-amount-packed": "index + account + amount (Uniswap merkle-distributor)",
  "account-amount-packed": "account + amount (no index)",
  "account-amount-abi-double-hashed": "account + amount, double-hashed (OpenZeppelin StandardMerkleTree)",
};

export function DistributorInput(props: {
  connected: boolean;
  network: string;
  onNetwork(value: string): void;
  distributorAddress: string;
  onDistributorAddress(value: string): void;
  claimAddress: string;
  onClaimAddress(value: string): void;
  treeSource: string;
  onTreeSource(value: string): void;
  leafEncoding: LeafEncoding;
  onLeafEncoding(value: LeafEncoding): void;
  blockNumber: string;
  onBlockNumber(value: string): void;
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
          <span>Distributor address</span>
          <input
            value={props.distributorAddress}
            onChange={(event) => props.onDistributorAddress(event.target.value)}
            placeholder="0x…"
            className="rounded-lg border border-white/15 bg-transparent p-2 font-mono text-xs"
          />
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span>Address to check</span>
          <input
            value={props.claimAddress}
            onChange={(event) => props.onClaimAddress(event.target.value)}
            placeholder="0x… (any address, not just yours)"
            className="rounded-lg border border-white/15 bg-transparent p-2 font-mono text-xs"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span>Leaf encoding</span>
          <select
            value={props.leafEncoding}
            onChange={(event) => props.onLeafEncoding(event.target.value as LeafEncoding)}
            className="rounded-lg border border-white/15 bg-transparent p-2 text-xs"
          >
            {LEAF_ENCODINGS.map((encoding) => (
              <option key={encoding} value={encoding}>
                {ENCODING_LABELS[encoding]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        <span>Tree source (HTTPS URL, ipfs://, or a bare CID)</span>
        <input
          value={props.treeSource}
          onChange={(event) => props.onTreeSource(event.target.value)}
          placeholder="https://… or ipfs://… or a CID"
          className="rounded-lg border border-white/15 bg-transparent p-2 font-mono text-xs"
        />
      </label>

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

      <button
        type="submit"
        disabled={props.busy || !props.connected}
        className="rounded-lg border border-[#d9a441]/40 bg-[#d9a441]/10 px-4 py-2 text-sm font-medium text-[#f2c86d] disabled:opacity-50"
      >
        {props.busy ? "Verifying…" : "Verify claim"}
      </button>
    </form>
  );
}
