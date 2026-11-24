type ContractInputProps = {
  contractId: string;
  network: string;
  windowStart: string;
  windowEnd: string;
  disabled: boolean;
  onContractId: (value: string) => void;
  onNetwork: (value: string) => void;
  onWindowStart: (value: string) => void;
  onWindowEnd: (value: string) => void;
};

export function ContractInput({
  contractId,
  network,
  windowStart,
  windowEnd,
  disabled,
  onContractId,
  onNetwork,
  onWindowStart,
  onWindowEnd,
}: ContractInputProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor="contractId" className="text-sm font-medium">
          Contract ID
        </label>
        <input
          id="contractId"
          type="text"
          value={contractId}
          onChange={(e) => onContractId(e.target.value)}
          disabled={disabled}
          placeholder="C…"
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-mono text-sm disabled:opacity-50"
        />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="network" className="text-sm font-medium">
          Network
        </label>
        <select
          id="network"
          value={network}
          onChange={(e) => onNetwork(e.target.value)}
          disabled={disabled}
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm disabled:opacity-50"
        >
          <option value="stellar-testnet">Testnet</option>
          <option value="stellar-pubnet">Pubnet</option>
        </select>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <label htmlFor="windowStart" className="text-sm font-medium">
            Window start ledger
          </label>
          <input
            id="windowStart"
            type="number"
            value={windowStart}
            onChange={(e) => onWindowStart(e.target.value)}
            disabled={disabled}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm disabled:opacity-50"
          />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="windowEnd" className="text-sm font-medium">
            Window end ledger
          </label>
          <input
            id="windowEnd"
            type="number"
            value={windowEnd}
            onChange={(e) => onWindowEnd(e.target.value)}
            disabled={disabled}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm disabled:opacity-50"
          />
        </div>
      </div>
    </div>
  );
}
