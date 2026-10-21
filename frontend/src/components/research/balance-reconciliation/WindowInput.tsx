"use client";

type Network = "stellar-testnet" | "stellar-pubnet";

type WindowInputProps = {
  account: string;
  network: Network;
  fromLedger: string;
  toLedger: string;
  disabled: boolean;
  onAccount: (value: string) => void;
  onNetwork: (value: Network) => void;
  onFrom: (value: string) => void;
  onTo: (value: string) => void;
};

export function WindowInput(props: WindowInputProps) {
  return (
    <>
      <label className="flex flex-col gap-1 text-sm" htmlFor="balance-account">
        Account
        <input id="balance-account" value={props.account} autoComplete="off" spellCheck={false} disabled={props.disabled} onChange={(event) => props.onAccount(event.target.value.trim())} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 font-mono text-xs" />
      </label>
      <label className="flex flex-col gap-1 text-sm" htmlFor="balance-network">
        Network
        <select id="balance-network" value={props.network} disabled={props.disabled} onChange={(event) => props.onNetwork(event.target.value as Network)} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2">
          <option value="stellar-testnet">stellar-testnet</option>
          <option value="stellar-pubnet">stellar-pubnet</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm" htmlFor="balance-from">
        From ledger
        <input id="balance-from" inputMode="numeric" value={props.fromLedger} disabled={props.disabled} onChange={(event) => props.onFrom(event.target.value)} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2" />
      </label>
      <label className="flex flex-col gap-1 text-sm" htmlFor="balance-to">
        To ledger
        <input id="balance-to" inputMode="numeric" value={props.toLedger} disabled={props.disabled} onChange={(event) => props.onTo(event.target.value)} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2" />
      </label>
    </>
  );
}
