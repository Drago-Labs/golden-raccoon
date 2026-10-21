"use client";

type HashInputProps = {
  hash: string;
  network: "stellar-testnet" | "stellar-pubnet";
  disabled: boolean;
  onHash: (value: string) => void;
  onNetwork: (value: "stellar-testnet" | "stellar-pubnet") => void;
};

export function HashInput(props: HashInputProps) {
  return (
    <>
      <label className="flex flex-col gap-1 text-sm" htmlFor="tx-failure-hash">
        Transaction hash
        <input
          id="tx-failure-hash"
          value={props.hash}
          maxLength={64}
          autoComplete="off"
          spellCheck={false}
          disabled={props.disabled}
          onChange={(event) => props.onHash(event.target.value.trim())}
          className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 font-mono text-xs"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm" htmlFor="tx-failure-network">
        Network
        <select
          id="tx-failure-network"
          value={props.network}
          disabled={props.disabled}
          onChange={(event) => props.onNetwork(event.target.value as HashInputProps["network"])}
          className="rounded-xl border border-white/10 bg-black/30 px-3 py-2"
        >
          <option value="stellar-testnet">stellar-testnet</option>
          <option value="stellar-pubnet">stellar-pubnet</option>
        </select>
      </label>
    </>
  );
}
