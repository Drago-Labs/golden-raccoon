type PoolInputProps = {
  poolId: string;
  network: string;
  disabled: boolean;
  onPoolId: (value: string) => void;
  onNetwork: (value: string) => void;
};

export function PoolInput({ poolId, network, disabled, onPoolId, onNetwork }: PoolInputProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap">
      <div className="flex min-w-[16rem] flex-1 flex-col gap-2">
        <label htmlFor="poolId" className="text-sm font-medium">
          Pool contract
        </label>
        <input
          id="poolId"
          type="text"
          value={poolId}
          onChange={(event) => onPoolId(event.target.value)}
          disabled={disabled}
          placeholder="C..."
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm disabled:opacity-50"
        />
      </div>
      <div className="flex min-w-[12rem] flex-col gap-2">
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
