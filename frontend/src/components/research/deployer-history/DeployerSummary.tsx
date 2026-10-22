import type { DeployerLookup } from "@/server/research/deployer-history";

export function DeployerSummary(props: { lookup: DeployerLookup }) {
  const { lookup } = props;

  if (!lookup.deployer) {
    return (
      <p className="text-sm text-white/70">
        Deployer could not be determined directly
        {lookup.creationBlock !== null ? ` (creation block ${lookup.creationBlock})` : ""}. See the warnings below.
      </p>
    );
  }

  return (
    <dl className="grid gap-3 text-sm sm:grid-cols-2">
      <div>
        <dt className="text-white/50">Deployer</dt>
        <dd className="font-mono text-xs">{lookup.deployer}</dd>
      </div>
      <div>
        <dt className="text-white/50">Creation block</dt>
        <dd>{lookup.creationBlock}</dd>
      </div>
      <div>
        <dt className="text-white/50">Creation transaction</dt>
        <dd className="font-mono text-xs">{lookup.creationTxHash}</dd>
      </div>
      <div>
        <dt className="text-white/50">Determined</dt>
        <dd>{lookup.direct ? "Directly (EOA deployment)" : "Indirectly"}</dd>
      </div>
    </dl>
  );
}
