import type { FormEvent } from "react";

export function ResolutionInput(props: {
  connected: boolean;
  ensName: string;
  onEnsNameChange: (v: string) => void;
  targetAddress: string;
  onTargetAddressChange: (v: string) => void;
  busy: boolean;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form onSubmit={props.onSubmit} className="space-y-4 rounded-lg border border-white/10 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs">
          <span>ENS name</span>
          <input
            aria-label="ENS name"
            value={props.ensName}
            onChange={(e) => props.onEnsNameChange(e.target.value)}
            placeholder="vitalik.eth"
            className="rounded border border-white/15 bg-black/40 px-2 py-1.5"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span>Target address</span>
          <input
            aria-label="Target address"
            value={props.targetAddress}
            onChange={(e) => props.onTargetAddressChange(e.target.value)}
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
        Verify ENS resolution
      </button>
    </form>
  );
}
