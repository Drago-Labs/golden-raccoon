"use client";

import { useId, useState } from "react";

const NETWORKS = [
  { id: "ethereum", label: "Ethereum" },
  { id: "base", label: "Base" },
  { id: "arbitrum", label: "Arbitrum" },
  { id: "optimism", label: "Optimism" },
  { id: "polygon", label: "Polygon" },
  { id: "bsc", label: "BNB Chain" },
  { id: "avalanche", label: "Avalanche" },
  { id: "goat", label: "GOAT Network" },
];

/**
 * The address and network a user wants inspected.
 *
 * Network is a required, explicit choice rather than an inherited default: the
 * same 20 bytes are different contracts on different chains, and silently
 * picking one would undo the scoping the rest of the feature is careful about.
 */
export function ContractInput({
  defaultNetwork,
  defaultAddress,
  busy,
  onSubmit,
}: {
  defaultNetwork: string;
  defaultAddress: string;
  busy: boolean;
  onSubmit: (request: { network: string; address: string }) => void;
}) {
  const addressId = useId();
  const networkId = useId();
  const errorId = useId();
  const [address, setAddress] = useState(defaultAddress);
  const [network, setNetwork] = useState(defaultNetwork);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      aria-label="Contract inspection"
      className="glass-panel flex flex-col gap-4 rounded-[28px] p-5 sm:p-6"
      onSubmit={(event) => {
        event.preventDefault();
        const trimmed = address.trim();

        if (!/^0x[0-9a-fA-F]{40}$/.test(trimmed)) {
          setError("Enter a 20-byte EVM address, starting with 0x.");
          return;
        }

        setError(null);
        onSubmit({ network, address: trimmed });
      }}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="flex flex-1 flex-col gap-1.5">
          <label htmlFor={addressId} className="text-xs font-medium uppercase tracking-[0.14em] text-white/54">
            Contract address
          </label>
          <input
            id={addressId}
            name="address"
            value={address}
            spellCheck={false}
            autoComplete="off"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            onChange={(event) => setAddress(event.target.value)}
            placeholder="0x…"
            className="w-full rounded-2xl border border-white/12 bg-white/5 px-4 py-2.5 font-mono text-sm text-white outline-none focus-visible:border-white/40 focus-visible:ring-2 focus-visible:ring-white/40"
          />
        </div>

        <div className="flex flex-col gap-1.5 sm:w-56">
          <label htmlFor={networkId} className="text-xs font-medium uppercase tracking-[0.14em] text-white/54">
            Network
          </label>
          <select
            id={networkId}
            name="network"
            value={network}
            onChange={(event) => setNetwork(event.target.value)}
            className="w-full rounded-2xl border border-white/12 bg-white/5 px-4 py-2.5 text-sm text-white outline-none focus-visible:border-white/40 focus-visible:ring-2 focus-visible:ring-white/40"
          >
            {NETWORKS.map((option) => (
              <option key={option.id} value={option.id} className="bg-[#151515]">
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          disabled={busy}
          className="rounded-2xl border border-white/14 bg-white/10 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/16 focus-visible:ring-2 focus-visible:ring-white/40 disabled:opacity-50"
        >
          {busy ? "Reading…" : "Inspect"}
        </button>
      </div>

      {error ? (
        <p id={errorId} role="alert" className="text-xs text-red-200">
          {error}
        </p>
      ) : null}
    </form>
  );
}
