type ContractInputProps = {
  contractId: string;
  network: string;
  disabled: boolean;
  onContractId: (value: string) => void;
  onNetwork: (value: string) => void;
};

export function ContractInput({
  contractId,
  network,
  disabled,
  onContractId,
  onNetwork,
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
          onChange={(event) => onContractId(event.target.value)}
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
          onChange={(event) => onNetwork(event.target.value)}
          disabled={disabled}
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm disabled:opacity-50"
        >
          <option value="stellar-testnet">Testnet</option>
          <option value="stellar-pubnet">Pubnet</option>
        </select>
      </div>
    </div>
  );
}
