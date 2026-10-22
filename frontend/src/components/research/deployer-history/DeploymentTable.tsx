import type { Deployment, ScanCoverage } from "@/server/research/deployer-history";

export function DeploymentTable(props: { deployments: Deployment[]; coverage: ScanCoverage | null }) {
  return (
    <div className="space-y-2">
      {props.coverage && (
        <p className="text-xs text-white/55">
          Scanned blocks {props.coverage.fromBlock}–{props.coverage.toBlock}
          {props.coverage.truncated ? " (truncated — more may exist outside this window)" : ""}.
        </p>
      )}

      {props.deployments.length === 0 ? (
        <p className="text-xs text-white/55">No other direct deployments were found in the scanned window.</p>
      ) : (
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Other contract creations by the same deployer</caption>
          <thead>
            <tr className="text-xs uppercase tracking-wide text-white/50">
              <th scope="col" className="pb-2">
                Address
              </th>
              <th scope="col" className="pb-2">
                Block
              </th>
              <th scope="col" className="pb-2">
                Code hash
              </th>
            </tr>
          </thead>
          <tbody>
            {props.deployments.map((deployment) => (
              <tr key={deployment.address} className="border-t border-white/10">
                <td className="py-2 font-mono text-xs">{deployment.address}</td>
                <td className="py-2">{deployment.blockNumber}</td>
                <td className="py-2 font-mono text-xs">{deployment.codeHash ?? "unavailable"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
