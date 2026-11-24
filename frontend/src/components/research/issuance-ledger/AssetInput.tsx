type Network = "stellar-testnet" | "stellar-pubnet";

type Props = {
  assetCode: string;
  issuer: string;
  network: Network;
  fromLedger: string;
  toLedger: string;
  disabled: boolean;
  onAssetCode: (value: string) => void;
  onIssuer: (value: string) => void;
  onNetwork: (value: Network) => void;
  onFrom: (value: string) => void;
  onTo: (value: string) => void;
};

export function AssetInput({
  assetCode,
  issuer,
  network,
  fromLedger,
  toLedger,
  disabled,
  onAssetCode,
  onIssuer,
  onNetwork,
  onFrom,
  onTo,
}: Props) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="flex flex-col gap-1 text-sm">
        <span>Asset code</span>
        <input
          aria-label="Asset code"
          value={assetCode}
          disabled={disabled}
          onChange={(event) => onAssetCode(event.target.value)}
          className="rounded-xl border border-white/10 bg-black/20 px-3 py-2"
          placeholder="USD"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span>Issuer</span>
        <input
          aria-label="Issuer"
          value={issuer}
          disabled={disabled}
          onChange={(event) => onIssuer(event.target.value)}
          className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 font-mono text-xs"
          placeholder="G…"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span>Network</span>
        <select
          aria-label="Network"
          value={network}
          disabled={disabled}
          onChange={(event) => onNetwork(event.target.value as Network)}
          className="rounded-xl border border-white/10 bg-black/20 px-3 py-2"
        >
          <option value="stellar-testnet">stellar-testnet</option>
          <option value="stellar-pubnet">stellar-pubnet</option>
        </select>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span>From ledger</span>
          <input
            aria-label="From ledger"
            value={fromLedger}
            disabled={disabled}
            onChange={(event) => onFrom(event.target.value)}
            className="rounded-xl border border-white/10 bg-black/20 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span>To ledger</span>
          <input
            aria-label="To ledger"
            value={toLedger}
            disabled={disabled}
            onChange={(event) => onTo(event.target.value)}
            className="rounded-xl border border-white/10 bg-black/20 px-3 py-2"
          />
        </label>
      </div>
    </div>
  );
}
