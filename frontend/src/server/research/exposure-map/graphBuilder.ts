/**
 * Builds the directed asset → issuer/protocol/underlying graph.
 *
 * Duplicate edges are collapsed before traversal so a relationship declared
 * twice cannot be walked twice, and every node carries a network-scoped key so
 * the same issuer name on two chains stays two nodes.
 */
import type { AdaptedHolding } from "./holdingsAdapter";
import type { ResolvedRelationship } from "./relationshipInput";
import { EXPOSURE_LIMITS, type ExposureEdge, type ExposureNodeKind } from "./schema";

export type GraphNode = {
  id: string;
  kind: ExposureNodeKind;
  label: string;
  network: string | null;
};

export type Graph = {
  nodes: Map<string, GraphNode>;
  /** Adjacency from node id to the relationships leaving it. */
  outgoing: Map<string, ResolvedRelationship[]>;
  /** Edges that were collapsed as exact duplicates. */
  duplicateEdges: ExposureEdge[];
};

function edgeKey(relationship: ResolvedRelationship): string {
  return `${relationship.fromId}→${relationship.toId}|${relationship.kind}`;
}

export function buildGraph(holdings: AdaptedHolding[], relationships: ResolvedRelationship[]): Graph {
  const nodes = new Map<string, GraphNode>();

  for (const holding of holdings) {
    nodes.set(holding.id, {
      id: holding.id,
      kind: "holding",
      label: holding.label,
      network: holding.network,
    });
  }

  const seen = new Map<string, ResolvedRelationship>();
  const duplicateEdges: ExposureEdge[] = [];

  for (const relationship of relationships) {
    const key = edgeKey(relationship);
    const existing = seen.get(key);

    if (existing) {
      duplicateEdges.push({
        from: relationship.fromId,
        to: relationship.toId,
        kind: relationship.kind,
        provenance: relationship.provenance,
        observedAt: relationship.observedAt,
        status: "dropped_duplicate",
        note: "An identical relationship was already declared. It is shown once and counted once.",
      });
      continue;
    }

    seen.set(key, relationship);

    if (!nodes.has(relationship.toId)) {
      if (nodes.size >= EXPOSURE_LIMITS.maxNodes) {
        throw new RangeError(`Exposure graph exceeded the ${EXPOSURE_LIMITS.maxNodes} node bound.`);
      }

      nodes.set(relationship.toId, {
        id: relationship.toId,
        kind: relationship.kind,
        label: relationship.toLabel,
        network: relationship.toNetwork,
      });
    }
  }

  const outgoing = new Map<string, ResolvedRelationship[]>();

  for (const relationship of seen.values()) {
    const bucket = outgoing.get(relationship.fromId);
    if (bucket) bucket.push(relationship);
    else outgoing.set(relationship.fromId, [relationship]);
  }

  return { nodes, outgoing, duplicateEdges };
}
