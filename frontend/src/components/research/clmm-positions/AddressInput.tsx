type AddressInputProps = {
  address: string;
  network: string;
  disabled?: boolean;
  onAddress: (value: string) => void;
  onNetwork: (value: string) => void;
};

export function AddressInput({ address, network, disabled, onAddress, onNetwork }: AddressInputProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Account address</span>
        <input
          required
          value={address}
          onChange={(event) => onAddress(event.target.value)}
          disabled={disabled}
          placeholder="0x…"
          aria-label="Account address"
          className="rounded-lg border border-white/15 bg-transparent p-2 font-mono text-sm disabled:opacity-50"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Network</span>
        <select
          value={network}
          onChange={(event) => onNetwork(event.target.value)}
          disabled={disabled}
          aria-label="Network"
          className="rounded-lg border border-white/15 bg-transparent p-2 text-sm disabled:opacity-50"
        >
          <option value="ethereum">Ethereum</option>
          <option value="base">Base</option>
          <option value="arbitrum">Arbitrum</option>
        </select>
      </label>
    </div>
  );
}
