import type { CorrelationCluster } from "@/server/research/holding-correlation";

export function ClusterPanel(props: { clusters: CorrelationCluster[] }) {
  return (
    <div className="space-y-2 rounded-lg border border-white/10 p-4 text-xs">
      <h3 className="text-sm font-medium text-white">Co-moving clusters</h3>
      {props.clusters.length === 0 ? (
        <p className="text-white/60">No holdings exceeded the cluster threshold.</p>
      ) : (
        <ul className="space-y-2">
          {props.clusters.map((cluster) => (
            <li key={cluster.clusterId} className="rounded border border-white/10 p-2">
              <span className="font-medium text-white">{cluster.assets.join(", ")}</span>{" "}
              <span className="text-white/60">(min r = {cluster.minPairwisePearson.toFixed(4)})</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
