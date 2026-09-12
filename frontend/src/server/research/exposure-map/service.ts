import type { TokenHolding } from "@/server/types";
import { getChainFamily, normalizeNetwork } from "@/lib/chainIdentity";
import { adaptHoldings } from "./holdingsAdapter";
import { normalizeRelationships } from "./relationshipInput";
import { buildDirectedGraph } from "./graphBuilder";
import { calculateAllocations, safeUsd } from "./allocation";
import { calculateConcentration } from "./concentration";
import { calculateCoverageGaps } from "./coverage";
import type {
  ExposureMapResult,
  RelationshipDeclaration,
} from "./schema";

export type ExposureMapServiceInput = {
  walletAddress?: string;
  chain?: string;
  holdings?: Partial<TokenHolding>[];
  customRelationships?: RelationshipDeclaration[];
  timestamp?: string;
};

/**
 * Executes read-only portfolio exposure analysis mapping shared issuers, protocols, and underlyings.
 */
export function generateExposureMap(input: ExposureMapServiceInput): ExposureMapResult {
  const chainFamily = getChainFamily(input.chain);
  const network = normalizeNetwork(input.chain, chainFamily);
  const evaluationTimestamp = input.timestamp || new Date().toISOString();

  const adaptedHoldings = adaptHoldings(input.holdings || [], input.chain);
  const relationships = normalizeRelationships(input.customRelationships || []);

  const directedGraph = buildDirectedGraph(adaptedHoldings, relationships);

  const { nodesWithAllocations, byIssuer, byProtocol, byUnderlying } = calculateAllocations(
    adaptedHoldings,
    directedGraph.nodes,
    directedGraph.edges
  );

  const totalPortfolioValueUsd = safeUsd(
    adaptedHoldings.reduce((sum, h) => sum + h.valueUsd, 0)
  );

  const concentration = calculateConcentration(byIssuer, byProtocol, totalPortfolioValueUsd);

  const coverage = calculateCoverageGaps(
    adaptedHoldings,
    nodesWithAllocations,
    directedGraph.edges,
    evaluationTimestamp
  );

  return {
    walletAddress: input.walletAddress || "unconnected",
    network,
    nodes: nodesWithAllocations,
    edges: directedGraph.edges,
    cycles: directedGraph.cycles,
    groupedExposures: {
      byIssuer,
      byProtocol,
      byUnderlying,
    },
    concentration,
    coverage,
    adaptedHoldings,
    evaluatedAt: evaluationTimestamp,
  };
}
