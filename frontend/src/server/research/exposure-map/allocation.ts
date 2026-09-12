import type {
  AdaptedHolding,
  ExposureGraphEdge,
  ExposureGraphNode,
  GroupedExposureItem,
} from "./schema";

export function safeDecimal(value: number, decimals = 4): number {
  if (!Number.isFinite(value)) return 0;
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

export function safeUsd(value: number): number {
  return safeDecimal(value, 2);
}

type PathStep = {
  nodeId: string;
  weight: number;
  isLookThrough: boolean;
};

/**
 * Calculates decimal-safe grouped exposure across issuers, protocols, and underlyings without double counting.
 */
export function calculateAllocations(
  holdings: AdaptedHolding[],
  nodes: ExposureGraphNode[],
  edges: ExposureGraphEdge[]
): {
  nodesWithAllocations: ExposureGraphNode[];
  byIssuer: GroupedExposureItem[];
  byProtocol: GroupedExposureItem[];
  byUnderlying: GroupedExposureItem[];
} {
  const totalPortfolioValueUsd = safeUsd(holdings.reduce((sum, h) => sum + h.valueUsd, 0));

  const edgeMap = new Map<string, ExposureGraphEdge[]>();
  for (const edge of edges) {
    const list = edgeMap.get(edge.source) || [];
    list.push(edge);
    edgeMap.set(edge.source, list);
  }

  const nodeMap = new Map<string, ExposureGraphNode>();
  for (const node of nodes) {
    nodeMap.set(node.id, { ...node });
  }

  const entityAccumulator = new Map<
    string,
    {
      directUsd: number;
      lookThroughUsd: number;
      distinctChains: Set<string>;
      sourceHoldings: Map<
        string,
        { symbol: string; network: string; allocatedUsd: number; lookThrough: boolean }
      >;
    }
  >();

  for (const holding of holdings) {
    if (holding.valueUsd <= 0) continue;

    const visitedForHolding = new Map<string, { weight: number; isLookThrough: boolean }>();
    const queue: PathStep[] = [{ nodeId: holding.assetKey, weight: 1.0, isLookThrough: false }];

    while (queue.length > 0) {
      const { nodeId, weight, isLookThrough } = queue.shift()!;
      const outgoing = edgeMap.get(nodeId) || [];

      for (const edge of outgoing) {
        const targetNode = nodeMap.get(edge.target);
        if (!targetNode) continue;

        const edgeWeight = Math.min(1.0, Math.max(0, edge.weight));
        const effectiveWeight = weight * edgeWeight;
        const targetIsLookThrough =
          isLookThrough || edge.relationship === "backed_by" || edge.relationship === "derives_from";

        const existing = visitedForHolding.get(edge.target);
        if (!existing) {
          visitedForHolding.set(edge.target, {
            weight: Math.min(1.0, effectiveWeight),
            isLookThrough: targetIsLookThrough,
          });
          queue.push({
            nodeId: edge.target,
            weight: effectiveWeight,
            isLookThrough: targetIsLookThrough,
          });
        } else {
          const combinedWeight = Math.min(1.0, existing.weight + effectiveWeight);
          visitedForHolding.set(edge.target, {
            weight: combinedWeight,
            isLookThrough: existing.isLookThrough || targetIsLookThrough,
          });
        }
      }
    }

    for (const [entityId, { weight, isLookThrough }] of visitedForHolding.entries()) {
      const allocatedValue = safeUsd(holding.valueUsd * weight);
      if (allocatedValue <= 0) continue;

      let accumulator = entityAccumulator.get(entityId);
      if (!accumulator) {
        accumulator = {
          directUsd: 0,
          lookThroughUsd: 0,
          distinctChains: new Set<string>(),
          sourceHoldings: new Map(),
        };
        entityAccumulator.set(entityId, accumulator);
      }

      if (isLookThrough) {
        accumulator.lookThroughUsd = safeUsd(accumulator.lookThroughUsd + allocatedValue);
      } else {
        accumulator.directUsd = safeUsd(accumulator.directUsd + allocatedValue);
      }

      accumulator.distinctChains.add(holding.network);

      const existingSource = accumulator.sourceHoldings.get(holding.assetKey);
      if (existingSource) {
        existingSource.allocatedUsd = safeUsd(existingSource.allocatedUsd + allocatedValue);
        existingSource.lookThrough = existingSource.lookThrough || isLookThrough;
      } else {
        accumulator.sourceHoldings.set(holding.assetKey, {
          symbol: holding.symbol,
          network: holding.network,
          allocatedUsd: allocatedValue,
          lookThrough: isLookThrough,
        });
      }
    }
  }

  for (const [entityId, acc] of entityAccumulator.entries()) {
    const node = nodeMap.get(entityId);
    if (node) {
      const totalExposure = safeUsd(acc.directUsd + acc.lookThroughUsd);
      node.directValueUsd = acc.directUsd;
      node.lookThroughValueUsd = acc.lookThroughUsd;
      node.totalExposureUsd = totalExposure;
      node.holdingCount = acc.sourceHoldings.size;
      node.portfolioSharePercent =
        totalPortfolioValueUsd > 0
          ? safeDecimal((totalExposure / totalPortfolioValueUsd) * 100, 2)
          : 0;
    }
  }

  const byIssuer: GroupedExposureItem[] = [];
  const byProtocol: GroupedExposureItem[] = [];
  const byUnderlying: GroupedExposureItem[] = [];

  for (const [entityId, acc] of entityAccumulator.entries()) {
    const node = nodeMap.get(entityId);
    if (!node || node.type === "holding") continue;

    const totalExposure = safeUsd(acc.directUsd + acc.lookThroughUsd);
    const sharePercent =
      totalPortfolioValueUsd > 0
        ? safeDecimal((totalExposure / totalPortfolioValueUsd) * 100, 2)
        : 0;

    const item: GroupedExposureItem = {
      entityId,
      entityType: node.type as "issuer" | "protocol" | "underlying",
      name: node.name,
      category: typeof node.metadata?.category === "string" ? node.metadata.category : undefined,
      exposureUsd: totalExposure,
      directValueUsd: acc.directUsd,
      lookThroughValueUsd: acc.lookThroughUsd,
      portfolioSharePercent: sharePercent,
      holdingCount: acc.sourceHoldings.size,
      distinctChains: Array.from(acc.distinctChains),
      sourceHoldings: Array.from(acc.sourceHoldings.entries()).map(([assetKey, val]) => ({
        assetKey,
        symbol: val.symbol,
        network: val.network,
        allocatedUsd: val.allocatedUsd,
        lookThrough: val.lookThrough,
      })),
    };

    if (node.type === "issuer") byIssuer.push(item);
    else if (node.type === "protocol") byProtocol.push(item);
    else if (node.type === "underlying") byUnderlying.push(item);
  }

  const sortByExposure = (a: GroupedExposureItem, b: GroupedExposureItem) =>
    b.exposureUsd - a.exposureUsd;

  byIssuer.sort(sortByExposure);
  byProtocol.sort(sortByExposure);
  byUnderlying.sort(sortByExposure);

  return {
    nodesWithAllocations: Array.from(nodeMap.values()),
    byIssuer,
    byProtocol,
    byUnderlying,
  };
}
