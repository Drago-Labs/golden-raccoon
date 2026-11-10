import type { FormEvent } from "react";

export function AddressInput(props: {
  connected: boolean;
  network: string;
  onNetworkChange: (v: string) => void;
  contractAddress: string;
  onAddressChange: (v: string) => void;
  busy: boolean;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form onSubmit={props.onSubmit} className="space-y-4 rounded-lg border border-white/10 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs">
          <span>Network</span>
          <select
            aria-label="Network"
            value={props.network}
            onChange={(e) => props.onNetworkChange(e.target.value)}
            className="rounded border border-white/15 bg-black/40 px-2 py-1.5"
          >
            <option value="ethereum">ethereum</option>
            <option value="base">base</option>
            <option value="arbitrum">arbitrum</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span>Contract address</span>
          <input
            aria-label="Contract address"
            value={props.contractAddress}
            onChange={(e) => props.onAddressChange(e.target.value)}
            placeholder="0x..."
            className="rounded border border-white/15 bg-black/40 px-2 py-1.5 font-mono"
          />
        </label>
      </div>
      <button
        type="submit"
        disabled={!props.connected || props.busy}
        className="rounded bg-white/90 px-4 py-2 text-xs font-semibold text-black disabled:opacity-40"
      >
        Check metamorphic pattern
      </button>
    </form>
  );
}
