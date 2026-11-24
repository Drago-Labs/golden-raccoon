"use client";

/** Names the portfolio to attribute: a public wallet and the network it is read on. */
export function PortfolioSelector({
  walletAddress,
  network,
  includeLiveSnapshot,
  busy,
  onWalletChange,
  onNetworkChange,
  onIncludeLiveChange,
}: {
  walletAddress: string;
  network: string;
  includeLiveSnapshot: boolean;
  busy: boolean;
  onWalletChange: (value: string) => void;
  onNetworkChange: (value: string) => void;
  onIncludeLiveChange: (value: boolean) => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="flex min-w-0 flex-1 flex-col gap-1">
        Public portfolio wallet
        <input
          required
          value={walletAddress}
          onChange={(event) => onWalletChange(event.target.value)}
          className="min-h-11 rounded border bg-transparent p-2"
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      <label className="flex flex-col gap-1">
        Network
        <select
          value={network}
          onChange={(event) => onNetworkChange(event.target.value)}
          className="min-h-11 rounded border bg-background p-2"
        >
          {["ethereum", "base", "goat", "arbitrum", "optimism", "polygon", "bsc", "avalanche", "stellar-testnet", "stellar-pubnet"].map(
            (id) => (
              <option key={id}>{id}</option>
            ),
          )}
        </select>
      </label>
      <label className="flex min-h-11 items-center gap-2">
        <input
          type="checkbox"
          checked={includeLiveSnapshot}
          disabled={busy}
          onChange={(event) => onIncludeLiveChange(event.target.checked)}
        />
        Add a live portfolio read as the latest observation
      </label>
    </div>
  );
}
