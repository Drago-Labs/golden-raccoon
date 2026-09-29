"use client";

import type { FormEvent } from "react";

type Props = {
  network: "stellar-testnet" | "stellar-pubnet";
  accountAddress: string;
  assetQuery: string;
  pageSize: number;
  maxPages: number;
  busy: boolean;
  mismatch: boolean;
  onNetwork: (value: "stellar-testnet" | "stellar-pubnet") => void;
  onAccount: (value: string) => void;
  onAsset: (value: string) => void;
  onPageSize: (value: number) => void;
  onMaxPages: (value: number) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function InspectorForm(props: Props) {
  return (
    <form onSubmit={props.onSubmit} className="glass-panel grid gap-4 rounded-2xl p-5">
      <label className="grid gap-1 text-sm">
        <span>Network</span>
        <select
          value={props.network}
          disabled={props.busy}
          onChange={(event) => props.onNetwork(event.target.value as "stellar-testnet" | "stellar-pubnet")}
          className="rounded-xl border border-white/10 bg-black/30 px-3 py-2"
        >
          <option value="stellar-testnet">stellar-testnet</option>
          <option value="stellar-pubnet">stellar-pubnet</option>
        </select>
      </label>
      {props.mismatch ? (
        <div role="alert" className="rounded-xl border border-amber-300/20 p-3 text-sm">
          Selected network does not match the connected wallet network.
        </div>
      ) : null}
      <label className="grid gap-1 text-sm">
        <span>Account (G-address)</span>
        <input
          value={props.accountAddress}
          disabled={props.busy}
          onChange={(event) => props.onAccount(event.target.value.trim())}
          placeholder="G..."
          className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 font-mono text-xs"
          autoComplete="off"
        />
      </label>
      <label className="grid gap-1 text-sm">
        <span>Asset (XLM, CODE:ISSUER, or contract ID)</span>
        <input
          value={props.assetQuery}
          disabled={props.busy}
          onChange={(event) => props.onAsset(event.target.value)}
          placeholder="USDC:G... or C..."
          className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 font-mono text-xs"
          autoComplete="off"
          required
        />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span>Event page size</span>
          <input
            type="number"
            min={1}
            max={50}
            value={props.pageSize}
            disabled={props.busy}
            onChange={(event) => props.onPageSize(Number(event.target.value))}
            className="rounded-xl border border-white/10 bg-black/30 px-3 py-2"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span>Max event pages</span>
          <input
            type="number"
            min={1}
            max={5}
            value={props.maxPages}
            disabled={props.busy}
            onChange={(event) => props.onMaxPages(Number(event.target.value))}
            className="rounded-xl border border-white/10 bg-black/30 px-3 py-2"
          />
        </label>
      </div>
      <button
        type="submit"
        disabled={props.busy || props.mismatch || !props.assetQuery.trim()}
        className="rounded-full border border-[#d9a441]/40 bg-[#d9a441]/15 px-4 py-2 text-sm font-medium text-[#f2c86d] disabled:opacity-40"
      >
        Inspect issuer controls
      </button>
    </form>
  );
}
