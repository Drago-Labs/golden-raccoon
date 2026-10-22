import type { MutabilityResult } from "@/server/research/nft-metadata";

export function MutabilityPanel(props: { mutability: MutabilityResult }) {
  const { mutability } = props;
  const detectedSetters = mutability.baseUriSetterSignals.filter((signal) => signal.detected);
  const detectedFreezeFlags = mutability.freezeFlags.filter((signal) => signal.detected);

  return (
    <div className="space-y-4 text-sm">
      <div>
        <h3 className="font-medium">Owner</h3>
        <p className="mt-1 font-mono text-xs text-white/70">{mutability.owner ?? "no owner() function detected"}</p>
      </div>

      <div>
        <h3 className="font-medium">Base-URI setter functions</h3>
        <p className="mt-1 text-xs text-white/55">
          A function is only reported as detected when a probe call reverted with an access-control-style reason —
          proof the function exists, even though this probe&apos;s caller was rejected. A function that exists but
          returns nothing on success is indistinguishable from one that does not exist at all, so an undetected
          result here is not proof the collection&apos;s metadata is immutable.
        </p>
        {detectedSetters.length === 0 ? (
          <p className="mt-2 text-xs text-white/55">No evidence found among the probed signatures.</p>
        ) : (
          <ul className="mt-2 space-y-1 text-xs">
            {detectedSetters.map((signal) => (
              <li key={signal.name} className="font-mono">
                {signal.name} — {signal.evidence}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h3 className="font-medium">Freeze flags</h3>
        {detectedFreezeFlags.length === 0 ? (
          <p className="mt-2 text-xs text-white/55">No freeze-style view function found among the probed signatures.</p>
        ) : (
          <ul className="mt-2 space-y-1 text-xs">
            {detectedFreezeFlags.map((signal) => (
              <li key={signal.name} className="font-mono">
                {signal.name} — {signal.evidence}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h3 className="font-medium">ERC-4906 metadata-update events</h3>
        <p className="mt-1 text-xs text-white/70">
          {mutability.metadataUpdateScan.metadataUpdateCount} <code>MetadataUpdate</code> and{" "}
          {mutability.metadataUpdateScan.batchMetadataUpdateCount} <code>BatchMetadataUpdate</code> event(s) found
          between blocks {mutability.metadataUpdateScan.fromBlock} and {mutability.metadataUpdateScan.toBlock}
          {mutability.metadataUpdateScan.truncated ? " (window truncated to a bounded lookback)" : ""}.
        </p>
      </div>
    </div>
  );
}
