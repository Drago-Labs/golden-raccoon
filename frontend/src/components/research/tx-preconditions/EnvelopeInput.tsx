type Network = "stellar-testnet" | "stellar-pubnet";

export function EnvelopeInput({
  envelopeXdr,
  network,
  disabled,
  onEnvelope,
  onNetwork,
}: {
  envelopeXdr: string;
  network: Network;
  disabled?: boolean;
  onEnvelope: (value: string) => void;
  onNetwork: (value: Network) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted">Transaction envelope XDR</span>
        <textarea
          name="envelopeXdr"
          aria-label="Transaction envelope XDR"
          value={envelopeXdr}
          disabled={disabled}
          onChange={(event) => onEnvelope(event.target.value)}
          rows={6}
          spellCheck={false}
          className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 font-mono text-xs text-white"
          placeholder="Paste a TransactionEnvelope XDR (fee-bump wrappers included)"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted">Network</span>
        <select
          name="network"
          aria-label="Network"
          value={network}
          disabled={disabled}
          onChange={(event) => onNetwork(event.target.value as Network)}
          className="w-full max-w-xs rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white"
        >
          <option value="stellar-testnet">Stellar testnet</option>
          <option value="stellar-pubnet">Stellar pubnet</option>
        </select>
      </label>
    </div>
  );
}
