import type {
  AdaptedHolding,
  CoverageGaps,
  ExposureGraphEdge,
  ExposureGraphNode,
  OverlappingCategory,
  UnpricedHoldingNotice,
  UnresolvedHoldingNotice,
} from "./schema";
import { safeDecimal, safeUsd } from "./allocation";

/**
 * Quantifies pricing completeness, relationship resolution, and category overlaps.
 */
export function calculateCoverageGaps(
  holdings: AdaptedHolding[],
  nodes: ExposureGraphNode[],
  edges: ExposureGraphEdge[],
  observationTimestamp = new Date().toISOString()
): CoverageGaps {
  const totalHoldingsCount = holdings.length;
  const pricedHoldings = holdings.filter((h) => h.priceStatus === "priced" && h.priceUsd !== null);
  const pricedHoldingsCount = pricedHoldings.length;
  const unpricedHoldingsCount = totalHoldingsCount - pricedHoldingsCount;

  const totalPortfolioValueUsd = safeUsd(holdings.reduce((sum, h) => sum + h.valueUsd, 0));

  const resolvedSourceKeys = new Set(edges.map((e) => e.source));
  const resolvedHoldings: AdaptedHolding[] = [];
  const unresolvedHoldingsNotices: UnresolvedHoldingNotice[] = [];

  for (const holding of holdings) {
    if (resolvedSourceKeys.has(holding.assetKey)) {
      resolvedHoldings.push(holding);
    } else {
      unresolvedHoldingsNotices.push({
        assetKey: holding.assetKey,
        symbol: holding.symbol,
        network: holding.network,
        valueUsd: holding.valueUsd,
        priceStatus: holding.priceStatus,
      });
    }
  }

  const resolvedHoldingsCount = resolvedHoldings.length;
  const unresolvedHoldingsCount = unresolvedHoldingsNotices.length;

  const unpricedHoldingsNotices: UnpricedHoldingNotice[] = holdings
    .filter((h) => h.priceStatus === "unavailable" || h.priceUsd === null)
    .map((h) => ({
      assetKey: h.assetKey,
      symbol: h.symbol,
      network: h.network,
      balance: h.balance,
    }));

  const resolvedValueUsd = safeUsd(resolvedHoldings.reduce((sum, h) => sum + h.valueUsd, 0));

  let knownValueCoverageRatio = 0;
  if (totalPortfolioValueUsd > 0) {
    knownValueCoverageRatio = Math.min(
      1.0,
      safeDecimal(resolvedValueUsd / totalPortfolioValueUsd, 4)
    );
  } else if (totalHoldingsCount > 0 && pricedHoldingsCount === 0) {
    knownValueCoverageRatio = 0;
  } else if (totalHoldingsCount > 0 && unresolvedHoldingsCount === 0) {
    knownValueCoverageRatio = 1.0;
  }

  let coverageStatus: "complete" | "partial" | "unavailable" = "complete";
  if (totalHoldingsCount === 0 || pricedHoldingsCount === 0) {
    coverageStatus = "unavailable";
  } else if (unpricedHoldingsCount > 0 || unresolvedHoldingsCount > 0) {
    coverageStatus = "partial";
  }

  const roleAccumulator = new Map<string, { name: string; roles: Set<string> }>();
  for (const node of nodes) {
    if (node.type === "holding") continue;
    let entry = roleAccumulator.get(node.id);
    if (!entry) {
      entry = { name: node.name, roles: new Set() };
      roleAccumulator.set(node.id, entry);
    }
    entry.roles.add(node.type);
    if (node.metadata?.category && typeof node.metadata.category === "string") {
      entry.roles.add(node.metadata.category);
    }
  }

  const overlappingCategories: OverlappingCategory[] = [];
  for (const [entityId, entry] of roleAccumulator.entries()) {
    if (entry.roles.size > 1) {
      overlappingCategories.push({
        entityId,
        name: entry.name,
        roles: Array.from(entry.roles),
      });
    }
  }

  return {
    totalHoldingsCount,
    resolvedHoldingsCount,
    unresolvedHoldingsCount,
    pricedHoldingsCount,
    unpricedHoldingsCount,
    totalPortfolioValueUsd,
    knownValueCoverageRatio,
    coverageStatus,
    observationTimestamp,
    unpricedHoldings: unpricedHoldingsNotices,
    unresolvedHoldings: unresolvedHoldingsNotices,
    overlappingCategories,
  };
}
