import type { FormEvent } from "react";
import { EVM_NETWORKS } from "@/server/research/authority-history/schema";

type Props = {
  network: string;
  contractAddress: string;
  fromBlock: string;
  toBlock: string;
  busy: boolean;
  onNetwork: (value: string) => void;
  onContractAddress: (value: string) => void;
  onFromBlock: (value: string) => void;
  onToBlock: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

const inputClass =
  "h-11 w-full rounded-xl border border-white/15 bg-black/25 px-3 text-sm text-white outline-none focus:border-[#d9a441]";

export function ScanRangeForm(props: Props) {
  return (
    <form
      aria-label="Authority history scan range"
      onSubmit={props.onSubmit}
      className="glass-panel space-y-4 rounded-2xl border border-white/10 p-5"
    >
      <div>
        <h2 className="text-lg font-semibold">Bounded scan range</h2>
        <p className="mt-1 text-sm text-white/50">
          Reads OwnershipTransferred, RoleGranted, RoleRevoked, RoleAdminChanged, and ERC-1967 AdminChanged logs only.
          Nothing is granted, revoked, or upgraded.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-xs text-white/60">
          Network
          <select
            value={props.network}
            onChange={(event) => props.onNetwork(event.target.value)}
            className={inputClass}
          >
            {EVM_NETWORKS.map((network) => (
              <option key={network} value={network}>
                {network}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs text-white/60">
          Contract address
          <input
            required
            placeholder="0x…"
            value={props.contractAddress}
            onChange={(event) => props.onContractAddress(event.target.value)}
            className={inputClass}
            spellCheck={false}
            autoComplete="off"
          />
        </label>
        <label className="space-y-1 text-xs text-white/60">
          From block
          <input
            required
            inputMode="numeric"
            pattern="[0-9]+"
            value={props.fromBlock}
            onChange={(event) => props.onFromBlock(event.target.value)}
            className={inputClass}
          />
        </label>
        <label className="space-y-1 text-xs text-white/60">
          To block
          <input
            required
            inputMode="numeric"
            pattern="[0-9]+"
            value={props.toBlock}
            onChange={(event) => props.onToBlock(event.target.value)}
            className={inputClass}
          />
        </label>
      </div>
      <button
        type="submit"
        disabled={props.busy}
        className="rounded-full bg-[#d9a441] px-5 py-2.5 text-sm font-semibold text-black disabled:opacity-60"
      >
        {props.busy ? "Reading authority logs…" : "Trace authority history"}
      </button>
    </form>
  );
}
