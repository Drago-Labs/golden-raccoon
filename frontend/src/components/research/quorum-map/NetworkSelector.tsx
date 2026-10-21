"use client";

type Network = "stellar-testnet" | "stellar-pubnet";

export function NetworkSelector({ network, disabled, onNetwork }: { network: Network; disabled: boolean; onNetwork: (value: Network) => void }) {
  return (
    <label className="flex flex-col gap-1 text-sm" htmlFor="quorum-network">
      Network
      <select id="quorum-network" value={network} disabled={disabled} onChange={(event) => onNetwork(event.target.value as Network)} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2">
        <option value="stellar-testnet">stellar-testnet</option>
        <option value="stellar-pubnet">stellar-pubnet</option>
      </select>
    </label>
  );
}
