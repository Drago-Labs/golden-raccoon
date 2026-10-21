"use client";

import type { FormEvent } from "react";
import type { NetworkId } from "@/server/research/rpc-consistency/schema";

const inputClass =
  "w-full min-w-0 rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none ring-emerald-300/40 focus:ring-2";

/**
 * Target, network, and optional contract-data key names.
 * The network control is explicit so testnet and mainnet cannot be mixed by accident.
 */
export function TargetInput(props: {
  network: NetworkId;
  target: string;
  contractKeys: string;
  busy: boolean;
  onNetworkChange: (network: NetworkId) => void;
  onTargetChange: (target: string) => void;
  onContractKeysChange: (value: string) => void;
  onSubmit: () => void;
}) {
  function submit(event: FormEvent) {
    event.preventDefault();
    props.onSubmit();
  }

  return (
    <form aria-label="Compare Horizon and Stellar RPC" className="glass-panel flex flex-col gap-4 rounded-[28px] p-4 sm:p-6" onSubmit={submit}>
      <div className="flex flex-col gap-2">
        <label htmlFor="rpc-consistency-target" className="text-sm font-medium">
          Account or contract
        </label>
        <input
          id="rpc-consistency-target"
          name="target"
          value={props.target}
          autoComplete="off"
          spellCheck={false}
          placeholder="G… or C…"
          className={`${inputClass} break-all`}
          onChange={(event) => props.onTargetChange(event.target.value)}
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="rpc-consistency-network" className="text-sm font-medium">
          Network
        </label>
        <select
          id="rpc-consistency-network"
          name="network"
          value={props.network}
          className={inputClass}
          onChange={(event) => props.onNetworkChange(event.target.value as NetworkId)}
        >
          <option value="testnet">Testnet</option>
          <option value="mainnet">Mainnet</option>
        </select>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="rpc-consistency-keys" className="text-sm font-medium">
          Contract data keys
        </label>
        <input
          id="rpc-consistency-keys"
          name="contractDataKeys"
          value={props.contractKeys}
          autoComplete="off"
          spellCheck={false}
          placeholder="Optional symbols, separated by spaces"
          aria-describedby="rpc-consistency-keys-hint"
          className={inputClass}
          onChange={(event) => props.onContractKeysChange(event.target.value)}
        />
        <p id="rpc-consistency-keys-hint" className="text-xs leading-5 text-white/50">
          Used when the target is a contract. Horizon does not expose these entries.
        </p>
      </div>

      <button
        type="submit"
        disabled={props.busy}
        className="w-full rounded-full bg-white px-4 py-2 text-sm font-semibold text-black disabled:opacity-60 sm:w-fit"
      >
        {props.busy ? "Comparing…" : "Compare providers"}
      </button>
    </form>
  );
}
