/**
 * Bounded traversal with explicit cycle detection.
 *
 * Every holding is walked independently. A node already on the current path is
 * a cycle: the edge that would close it is dropped and recorded, never
 * followed. A path that reaches the depth bound stops there and is recorded
 * too. Both cases are visible in the output, so a truncated walk is never
 * mistaken for a complete one.
 */
import type { Graph } from "./graphBuilder";
import { EXPOSURE_LIMITS, type ExposureEdge } from "./schema";

export type TraversalResult = {
  /** For each holding id, the set of node ids it reaches, each once. */
  reachable: Map<string, Set<string>>;
  appliedEdges: ExposureEdge[];
  droppedEdges: ExposureEdge[];
  cycleCount: number;
  depthTruncationCount: number;
};

export function traverse(graph: Graph, holdingIds: string[]): TraversalResult {
  const reachable = new Map<string, Set<string>>();
  const appliedEdges = new Map<string, ExposureEdge>();
  const droppedEdges: ExposureEdge[] = [];
  let cycleCount = 0;
  let depthTruncationCount = 0;

  for (const holdingId of holdingIds) {
    // `visited` is per-holding: reaching the same issuer through two different
    // paths must still count that holding's value exactly once.
    const visited = new Set<string>([holdingId]);
    const stack: Array<{ id: string; depth: number; path: Set<string> }> = [
      { id: holdingId, depth: 0, path: new Set([holdingId]) },
    ];

    while (stack.length > 0) {
      const current = stack.pop()!;
      const edges = graph.outgoing.get(current.id) ?? [];

      for (const edge of edges) {
        const key = `${edge.fromId}→${edge.toId}|${edge.kind}`;

        if (current.path.has(edge.toId)) {
          cycleCount += 1;
          droppedEdges.push({
            from: edge.fromId,
            to: edge.toId,
            kind: edge.kind,
            provenance: edge.provenance,
            observedAt: edge.observedAt,
            status: "dropped_cycle",
            note: "Following this edge would revisit a node already on the path. It is shown but excluded from attribution so a cycle cannot inflate a total.",
          });
          continue;
        }

        if (current.depth + 1 > EXPOSURE_LIMITS.maxTraversalDepth) {
          depthTruncationCount += 1;
          droppedEdges.push({
            from: edge.fromId,
            to: edge.toId,
            kind: edge.kind,
            provenance: edge.provenance,
            observedAt: edge.observedAt,
            status: "dropped_depth",
            note: `The traversal bound of ${EXPOSURE_LIMITS.maxTraversalDepth} hops was reached. Exposure beyond this point is not attributed.`,
          });
          continue;
        }

        appliedEdges.set(key, {
          from: edge.fromId,
          to: edge.toId,
          kind: edge.kind,
          provenance: edge.provenance,
          observedAt: edge.observedAt,
          status: "applied",
          note: `Declared via ${edge.provenance.replace(/_/g, " ")}.`,
        });

        if (!visited.has(edge.toId)) {
          visited.add(edge.toId);
          stack.push({ id: edge.toId, depth: current.depth + 1, path: new Set([...current.path, edge.toId]) });
        }
      }
    }

    visited.delete(holdingId);
    reachable.set(holdingId, visited);
  }

  return {
    reachable,
    appliedEdges: [...appliedEdges.values()],
    droppedEdges,
    cycleCount,
    depthTruncationCount,
  };
}
