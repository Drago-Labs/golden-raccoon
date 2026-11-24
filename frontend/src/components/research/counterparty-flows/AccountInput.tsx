type AccountInputProps = {
  account: string;
  network: string;
  disabled: boolean;
  onAccount: (value: string) => void;
  onNetwork: (value: string) => void;
};

export function AccountInput({ account, network, disabled, onAccount, onNetwork }: AccountInputProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:gap-6">
      <div className="flex flex-1 flex-col gap-2">
        <label htmlFor="counterparty-account" className="text-sm font-medium">
          Account
        </label>
        <input
          id="counterparty-account"
          type="text"
          value={account}
          onChange={(event) => onAccount(event.target.value)}
          disabled={disabled}
          placeholder="GABC..."
          autoComplete="off"
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm disabled:opacity-50"
        />
      </div>
      <div className="flex flex-col gap-2 sm:w-48">
        <label htmlFor="counterparty-network" className="text-sm font-medium">
          Network
        </label>
        <select
          id="counterparty-network"
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
