/**
 * Attributes holding value to the nodes each holding reaches.
 *
 * All arithmetic is integer micro-USD, so grouping many small positions cannot
 * drift the way repeated float addition does. A holding contributes its full
 * value to every node it reaches, but only once per node — the map answers
 * "how much of the portfolio touches this issuer", which is not a partition and
 * must not be presented as one.
 */
import type { AdaptedHolding } from "./holdingsAdapter";
import type { Graph } from "./graphBuilder";
import type { TraversalResult } from "./cycleGuard";
import type { ExposureNode } from "./schema";

export type Attribution = {
  nodes: ExposureNode[];
  byId: Map<string, ExposureNode>;
};

export function attributeExposure(
  graph: Graph,
  holdings: AdaptedHolding[],
  traversal: TraversalResult,
): Attribution {
  const byId = new Map<string, ExposureNode>();

  for (const node of graph.nodes.values()) {
    byId.set(node.id, {
      id: node.id,
      kind: node.kind,
      label: node.label,
      network: node.network,
      directMicroUsd: 0,
      totalMicroUsd: 0,
      contributingHoldings: [],
      valueIncomplete: false,
    });
  }

  for (const holding of holdings) {
    const self = byId.get(holding.id);

    if (self) {
      self.directMicroUsd = holding.valueMicroUsd ?? 0;
      self.totalMicroUsd = holding.valueMicroUsd ?? 0;
      self.contributingHoldings = [holding.id];
      self.valueIncomplete = !holding.priced;
    }

    const reached = traversal.reachable.get(holding.id) ?? new Set<string>();

    for (const nodeId of reached) {
      const target = byId.get(nodeId);
      if (!target) continue;

      // Guard against attributing the same holding twice if it were ever to
      // appear in the reachable set more than once.
      if (target.contributingHoldings.includes(holding.id)) continue;

      target.contributingHoldings.push(holding.id);
      target.totalMicroUsd += holding.valueMicroUsd ?? 0;
      if (!holding.priced) target.valueIncomplete = true;
    }
  }

  const nodes = [...byId.values()].sort((left, right) => {
    const byValue = right.totalMicroUsd - left.totalMicroUsd;
    if (byValue !== 0) return byValue;
    return left.id.localeCompare(right.id);
  });

  for (const node of nodes) node.contributingHoldings.sort();

  return { nodes, byId };
}
