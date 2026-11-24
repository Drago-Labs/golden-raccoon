"use client";

import type { FormEvent } from "react";

export function ContractInput(props: {
  networks: readonly string[];
  network: string;
  onNetwork: (value: string) => void;
  contractId: string;
  onContractId: (value: string) => void;
  balanceId: string;
  onBalanceId: (value: string) => void;
  busy: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form onSubmit={props.onSubmit} className="grid gap-4 rounded-xl border border-white/10 p-5" aria-label="SEP-41 contract input">
      <label className="grid gap-1 text-sm">
        <span className="text-white/60">Network</span>
        <select
          value={props.network}
          onChange={(event) => props.onNetwork(event.target.value)}
          disabled={props.busy}
          className="h-11 rounded-xl bg-black/25 px-3"
        >
          {props.networks.map((network) => (
            <option key={network} value={network}>
              {network}
            </option>
          ))}
        </select>
      </label>

      <label className="grid gap-1 text-sm">
        <span className="text-white/60">Contract id</span>
        <input
          required
          value={props.contractId}
          onChange={(event) => props.onContractId(event.target.value)}
          disabled={props.busy}
          placeholder="C…"
          className="h-11 rounded-xl bg-black/25 px-3 font-mono text-sm"
          aria-label="Contract id"
        />
      </label>

      <label className="grid gap-1 text-sm">
        <span className="text-white/60">Balance probe address (optional)</span>
        <input
          value={props.balanceId}
          onChange={(event) => props.onBalanceId(event.target.value)}
          disabled={props.busy}
          placeholder="G… or C…"
          className="h-11 rounded-xl bg-black/25 px-3 font-mono text-sm"
          aria-label="Balance probe address"
        />
      </label>

      <button
        type="submit"
        disabled={props.busy}
        className="justify-self-start rounded-full bg-[#d9a441] px-5 py-2 font-semibold text-black disabled:opacity-50"
      >
        {props.busy ? "Checking…" : "Check SEP-41 conformance"}
      </button>
    </form>
  );
}
