"use client";

type Network = "stellar-testnet" | "stellar-pubnet";

type AccountInputProps = {
  account: string;
  network: Network;
  recentWindowLedgers: string;
  disabled: boolean;
  onAccount: (value: string) => void;
  onNetwork: (value: Network) => void;
  onWindow: (value: string) => void;
};

export function AccountInput(props: AccountInputProps) {
  return (
    <>
      <label className="flex flex-col gap-1 text-sm" htmlFor="data-entry-account">
        Account
        <input
          id="data-entry-account"
          value={props.account}
          autoComplete="off"
          spellCheck={false}
          disabled={props.disabled}
          onChange={(event) => props.onAccount(event.target.value.trim())}
          className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 font-mono text-xs"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm" htmlFor="data-entry-network">
        Network
        <select
          id="data-entry-network"
          value={props.network}
          disabled={props.disabled}
          onChange={(event) => props.onNetwork(event.target.value as Network)}
          className="rounded-xl border border-white/10 bg-black/30 px-3 py-2"
        >
          <option value="stellar-testnet">stellar-testnet</option>
          <option value="stellar-pubnet">stellar-pubnet</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm" htmlFor="data-entry-window">
        Recent window in ledgers
        <input
          id="data-entry-window"
          inputMode="numeric"
          value={props.recentWindowLedgers}
          disabled={props.disabled}
          onChange={(event) => props.onWindow(event.target.value)}
          className="rounded-xl border border-white/10 bg-black/30 px-3 py-2"
        />
      </label>
    </>
  );
}
