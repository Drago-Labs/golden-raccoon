import type { CallTreeNode, FailureLocation } from "./schema";

/**
 * Finds the deepest failing call node in the call tree so inner failures are
 * pinpointed at the contract and function where they occurred.
 */
export function locateInnerFailure(roots: CallTreeNode[]): FailureLocation | null {
  let deepest: FailureLocation | null = null;

  function visit(node: CallTreeNode) {
    if (node.status === "failed") {
      if (!deepest || node.depth >= deepest.depth) {
        deepest = {
          nodeId: node.nodeId,
          contractId: node.contractId,
          functionName: node.functionName,
          depth: node.depth,
          errorMessage: node.errorMessage ?? "Contract execution failed",
        };
      }
    }
    for (const child of node.children) {
      visit(child);
    }
  }

  for (const root of roots) {
    visit(root);
  }

  return deepest;
}
