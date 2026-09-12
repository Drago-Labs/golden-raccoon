import type {
  AdaptedHolding,
  DetectedCycle,
  ExposureGraphEdge,
  ExposureGraphNode,
  RelationshipDeclaration,
} from "./schema";
import { sanitizeEdgesAndDetectCycles } from "./cycleGuard";

export type DirectedExposureGraph = {
  nodes: ExposureGraphNode[];
  edges: ExposureGraphEdge[];
  cycles: DetectedCycle[];
};

/**
 * Builds a directed asset-to-issuer/protocol/underlying graph with canonical network-scoped keys.
 */
export function buildDirectedGraph(
  holdings: AdaptedHolding[],
  relationships: RelationshipDeclaration[]
): DirectedExposureGraph {
  const nodeMap = new Map<string, ExposureGraphNode>();
  const totalPortfolioValue = holdings.reduce((sum, h) => sum + h.valueUsd, 0);

  for (const holding of holdings) {
    const portfolioShare = totalPortfolioValue > 0
      ? Number(((holding.valueUsd / totalPortfolioValue) * 100).toFixed(4))
      : 0;

    nodeMap.set(holding.assetKey, {
      id: holding.assetKey,
      type: "holding",
      name: holding.name,
      symbol: holding.symbol,
      network: holding.network,
      chainFamily: holding.chainFamily,
      directValueUsd: holding.valueUsd,
      lookThroughValueUsd: 0,
      totalExposureUsd: holding.valueUsd,
      portfolioSharePercent: portfolioShare,
      holdingCount: 1,
      metadata: {
        priceStatus: holding.priceStatus,
        priceUsd: holding.priceUsd,
        balance: holding.balance,
      },
    });
  }

  const rawEdges: ExposureGraphEdge[] = [];
  const activeSources = new Set<string>(nodeMap.keys());
  const expansionQueue = Array.from(activeSources);

  const relBySource = new Map<string, RelationshipDeclaration[]>();
  for (const rel of relationships) {
    const list = relBySource.get(rel.sourceAssetKey) || [];
    list.push(rel);
    relBySource.set(rel.sourceAssetKey, list);
  }

  const visitedEntities = new Set<string>();
  while (expansionQueue.length > 0) {
    const current = expansionQueue.shift()!;
    const rels = relBySource.get(current) || [];

    for (const rel of rels) {
      if (!nodeMap.has(rel.targetId)) {
        nodeMap.set(rel.targetId, {
          id: rel.targetId,
          type: rel.targetType,
          name: rel.targetName,
          directValueUsd: 0,
          lookThroughValueUsd: 0,
          totalExposureUsd: 0,
          portfolioSharePercent: 0,
          holdingCount: 0,
          metadata: {
            category: rel.category,
          },
        });
      }

      rawEdges.push({
        id: `edge:${rel.sourceAssetKey}->${rel.targetId}`,
        source: rel.sourceAssetKey,
        target: rel.targetId,
        relationship: rel.relationship,
        weight: rel.weight,
        provenance: rel.provenance,
      });

      if (!visitedEntities.has(rel.targetId)) {
        visitedEntities.add(rel.targetId);
        expansionQueue.push(rel.targetId);
      }
    }
  }

  const { safeEdges, cycles } = sanitizeEdgesAndDetectCycles(rawEdges);

  return {
    nodes: Array.from(nodeMap.values()),
    edges: safeEdges,
    cycles,
  };
}
