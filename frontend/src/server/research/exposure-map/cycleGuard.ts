import type { DetectedCycle, ExposureGraphEdge } from "./schema";

export const MAX_TRAVERSAL_DEPTH = 10;

/**
 * Detects cycles in directed relationship edges using depth-first search, severing cyclic edges.
 */
export function sanitizeEdgesAndDetectCycles(
  edges: ExposureGraphEdge[],
  maxDepth = MAX_TRAVERSAL_DEPTH
): { safeEdges: ExposureGraphEdge[]; cycles: DetectedCycle[] } {
  const safeEdges: ExposureGraphEdge[] = [];
  const cycles: DetectedCycle[] = [];

  const adjacency = new Map<string, Array<{ edge: ExposureGraphEdge; target: string }>>();
  for (const edge of edges) {
    const list = adjacency.get(edge.source) || [];
    list.push({ edge, target: edge.target });
    adjacency.set(edge.source, list);
  }

  const globalVisited = new Set<string>();

  function dfs(current: string, path: string[], depth: number) {
    if (depth > maxDepth) {
      return;
    }

    const currentPathSet = new Set(path);
    const neighbors = adjacency.get(current) || [];

    for (const { edge, target } of neighbors) {
      if (currentPathSet.has(target)) {
        const cycleStartIndex = path.indexOf(target);
        const cyclePath = [...path.slice(cycleStartIndex), target];
        cycles.push({
          path: cyclePath,
          severedEdge: `${edge.source}->${edge.target}`,
          reason: "Cyclic dependency detected and severed to prevent value inflation",
        });
        continue;
      }

      safeEdges.push(edge);
      dfs(target, [...path, target], depth + 1);
    }
  }

  const rootCandidates = new Set<string>();
  for (const edge of edges) {
    rootCandidates.add(edge.source);
  }

  for (const root of rootCandidates) {
    if (!globalVisited.has(root)) {
      globalVisited.add(root);
      dfs(root, [root], 1);
    }
  }

  const seenSafe = new Set<string>();
  const finalSafeEdges: ExposureGraphEdge[] = [];
  for (const edge of safeEdges) {
    const edgeKey = `${edge.source}->${edge.target}`;
    if (!seenSafe.has(edgeKey)) {
      seenSafe.add(edgeKey);
      finalSafeEdges.push(edge);
    }
  }

  return { safeEdges: finalSafeEdges, cycles };
}
