import type { CorrelationCluster, PairwiseCorrelation } from "./schema";

/**
 * Groups assets into connected components where pairs have Pearson correlation
 * >= threshold. Only clusters of 2 or more assets are returned.
 */
export function buildCorrelationClusters(
  assetIds: string[],
  pairs: PairwiseCorrelation[],
  threshold: number,
): CorrelationCluster[] {
  const adj = new Map<string, Set<string>>();
  for (const id of assetIds) adj.set(id, new Set());

  const pairLookup = new Map<string, number>();
  for (const pair of pairs) {
    if (!pair.insufficientOverlap && pair.pearson !== null && pair.pearson >= threshold) {
      adj.get(pair.assetA)?.add(pair.assetB);
      adj.get(pair.assetB)?.add(pair.assetA);
      pairLookup.set(`${pair.assetA}::${pair.assetB}`, pair.pearson);
      pairLookup.set(`${pair.assetB}::${pair.assetA}`, pair.pearson);
    }
  }

  const visited = new Set<string>();
  const clusters: CorrelationCluster[] = [];
  let index = 1;

  for (const id of assetIds) {
    if (visited.has(id)) continue;
    const neighbors = adj.get(id);
    if (!neighbors || neighbors.size === 0) continue;

    const queue = [id];
    const members: string[] = [];
    visited.add(id);

    while (queue.length > 0) {
      const curr = queue.shift()!;
      members.push(curr);
      for (const next of adj.get(curr) ?? []) {
        if (!visited.has(next)) {
          visited.add(next);
          queue.push(next);
        }
      }
    }

    if (members.length >= 2) {
      members.sort();
      let minPearson = 1;
      for (let i = 0; i < members.length; i++) {
        for (let j = i + 1; j < members.length; j++) {
          const val = pairLookup.get(`${members[i]}::${members[j]}`);
          if (val !== undefined && val < minPearson) minPearson = val;
        }
      }
      clusters.push({
        clusterId: `cluster-${index++}`,
        threshold,
        assets: members,
        minPairwisePearson: Number(minPearson.toFixed(6)),
      });
    }
  }

  return clusters;
}
