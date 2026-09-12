/**
 * Public entry point for the shared-exposure map.
 *
 * `buildExposureMap` is pure. It reads holdings and declared relationships and
 * returns a map. It calls no stress, cost-basis or execution service, performs
 * no write, and does not mutate its input.
 */
import { attributeExposure } from "./allocation";
import { buildGroups, countOverlappingGroups } from "./concentration";
import { buildCoverage, findUnresolved } from "./coverage";
import { traverse } from "./cycleGuard";
import { buildGraph } from "./graphBuilder";
import { adaptHoldings, assertWithinBounds, knownValueMicroUsd } from "./holdingsAdapter";
import { resolveRelationships } from "./relationshipInput";
import {
  EXPOSURE_MAP_SCHEMA_VERSION,
  ExposureMapError,
  exposureRequestSchema,
  type ExposureMap,
} from "./schema";

export type ExposureResult = {
  map: ExposureMap;
  /** Declarations that addressed nothing, or addressed too much, in this portfolio. */
  unmatchedDeclarations: Array<{ fromAssetKey: string; reason: string }>;
};

export function buildExposureMap(input: unknown): ExposureResult {
  const parsed = exposureRequestSchema.safeParse(input);

  if (!parsed.success) {
    throw new ExposureMapError("invalid_request", "The exposure request could not be read.", parsed.error.flatten());
  }

  const request = parsed.data;

  try {
    const holdings = adaptHoldings(request.holdings);
    assertWithinBounds(holdings);

    const { resolved, unmatched } = resolveRelationships(holdings, request.relationships);
    const graph = buildGraph(holdings, resolved);
    const traversal = traverse(graph, holdings.map((holding) => holding.id));
    const attribution = attributeExposure(graph, holdings, traversal);
    const knownValue = knownValueMicroUsd(holdings);
    const groups = buildGroups(attribution, holdings, resolved, knownValue);
    const overlappingGroupCount = countOverlappingGroups(groups);
    const unresolved = findUnresolved(holdings, attribution);

    const map: ExposureMap = {
      schemaVersion: EXPOSURE_MAP_SCHEMA_VERSION,
      walletAddress: request.walletAddress,
      network: request.network,
      observedAt: request.observedAt ?? new Date(0).toISOString(),
      nodes: attribution.nodes,
      edges: [...traversal.appliedEdges, ...traversal.droppedEdges, ...graph.duplicateEdges],
      groups,
      unresolved,
      coverage: buildCoverage(
        holdings,
        groups,
        unresolved,
        traversal,
        graph.duplicateEdges.length,
        knownValue,
        overlappingGroupCount,
      ),
    };

    return {
      map,
      unmatchedDeclarations: unmatched.map((entry) => ({
        fromAssetKey: entry.declaration.fromAssetKey,
        reason: entry.reason,
      })),
    };
  } catch (error) {
    if (error instanceof RangeError) {
      throw new ExposureMapError("bounds_exceeded", error.message);
    }
    throw error;
  }
}

export { ExposureMapError } from "./schema";
export type { ExposureMap } from "./schema";
