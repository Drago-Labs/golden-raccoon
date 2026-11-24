"use client";

import { DELEGATE_LIMITS } from "@/server/research/delegate-participation/limits";

/** Names the governance to read: chain, votes token, governor, and optional delegates. */
export function GovernanceSelector({
  chain,
  tokenAddress,
  governorAddress,
  delegates,
  busy,
  onChainChange,
  onTokenChange,
  onGovernorChange,
  onDelegatesChange,
  onSubmit,
}: {
  chain: string;
  tokenAddress: string;
  governorAddress: string;
  delegates: string;
  busy: boolean;
  onChainChange: (value: string) => void;
  onTokenChange: (value: string) => void;
  onGovernorChange: (value: string) => void;
  onDelegatesChange: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          Chain
          <select
            value={chain}
            onChange={(event) => onChainChange(event.target.value)}
            className="min-h-11 rounded border bg-background p-2"
          >
            {["ethereum", "base", "arbitrum", "optimism", "polygon", "bsc", "avalanche", "goat"].map((id) => (
              <option key={id}>{id}</option>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 flex-1 flex-col gap-1">
          Governance token address
          <input
            required
            value={tokenAddress}
            onChange={(event) => onTokenChange(event.target.value)}
            className="min-h-11 rounded border bg-transparent p-2"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <label className="flex min-w-0 flex-1 flex-col gap-1">
          Governor address
          <input
            required
            value={governorAddress}
            onChange={(event) => onGovernorChange(event.target.value)}
            className="min-h-11 rounded border bg-transparent p-2"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
      </div>
      <label className="flex flex-col gap-1">
        Delegates (comma separated; leave empty for the largest in range)
        <input
          value={delegates}
          onChange={(event) => onDelegatesChange(event.target.value)}
          className="min-h-11 rounded border bg-transparent p-2"
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={busy} className="min-h-11 rounded border px-4 py-2">
          {busy ? "Reading…" : "Read delegate participation"}
        </button>
        <p className="text-sm">
          At most {DELEGATE_LIMITS.maxDelegates} delegates and {DELEGATE_LIMITS.maxBlockSpan} blocks per report.
        </p>
      </div>
    </form>
  );
}
