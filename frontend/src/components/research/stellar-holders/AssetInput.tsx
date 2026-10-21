"use client";

import type { FormEvent } from "react";

type Props = {
  asset: string;
  network: "stellar-testnet" | "stellar-pubnet";
  busy: boolean;
  onAsset: (value: string) => void;
  onNetwork: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

/**
 * Asset and network controls. They stack on narrow viewports and sit on one
 * row from the `sm` breakpoint up.
 */
export function AssetInput(props: Props) {
  return (
    <form
      aria-label="Issued asset holder distribution"
      onSubmit={props.onSubmit}
      className="flex flex-col gap-4 sm:flex-row sm:items-end"
    >
      <label className="grid w-full gap-1 text-sm sm:flex-1">
        <span>Asset</span>
        <input
          value={props.asset}
          disabled={props.busy}
          onChange={(event) => props.onAsset(event.target.value)}
          placeholder="CODE:ISSUER"
          autoComplete="off"
          spellCheck={false}
          className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 font-mono text-xs"
        />
      </label>
      <label className="grid w-full gap-1 text-sm sm:w-56">
        <span>Network</span>
        <select
          value={props.network}
          disabled={props.busy}
          onChange={(event) => props.onNetwork(event.target.value)}
          className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2"
        >
          <option value="stellar-testnet">stellar-testnet</option>
          <option value="stellar-pubnet">stellar-pubnet</option>
        </select>
      </label>
      <button
        type="submit"
        disabled={props.busy}
        className="w-full rounded-full border border-[#d9a441]/40 bg-[#d9a441]/15 px-4 py-2 text-sm font-medium text-[#f2c86d] disabled:opacity-40 sm:w-auto"
      >
        Measure distribution
      </button>
    </form>
  );
}
