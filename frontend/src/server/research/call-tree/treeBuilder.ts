import { decodeArgument, decodeArgumentList } from "./argumentDecoder";
import { CALL_TREE_LIMITS } from "./limits";
import type { CallTreeNode, RawDiagnosticEvent, RawInvocationMeta } from "./schema";

/**
 * Reconstructs nested CallTreeNode hierarchy from diagnostic fn_call / fn_return / fn_error events.
 * When diagnostics are unavailable, builds a top-level-only tree from the envelope/meta root.
 */
export function buildCallTree(
  meta: RawInvocationMeta,
  events: RawDiagnosticEvent[],
): CallTreeNode[] {
  if (!meta.diagnosticsEnabled || events.length === 0) {
    const top: CallTreeNode = {
      nodeId: "node-1",
      depth: 0,
      order: 1,
      contractId: meta.topLevelCall.contractId,
      functionName: meta.topLevelCall.functionName,
      args: decodeArgumentList(meta.topLevelCall.args),
      returnValue: meta.topLevelCall.returnValue
        ? decodeArgument(meta.topLevelCall.returnValue, 0)
        : null,
      status: meta.topLevelCall.errorMessage ? "failed" : "succeeded",
      errorMessage: meta.topLevelCall.errorMessage ?? null,
      transfers: [],
      children: [],
    };
    return [top];
  }

  const roots: CallTreeNode[] = [];
  const stack: CallTreeNode[] = [];
  let counter = 0;

  for (const ev of events) {
    if (ev.kind === "fn_call") {
      if (stack.length >= CALL_TREE_LIMITS.maxDepth) continue;
      counter += 1;
      const node: CallTreeNode = {
        nodeId: `node-${counter}`,
        depth: stack.length,
        order: counter,
        contractId: ev.contractId,
        functionName: ev.functionName ?? "call",
        args: decodeArgumentList(ev.args ?? []),
        returnValue: null,
        status: "succeeded",
        errorMessage: null,
        transfers: [],
        children: [],
      };
      if (stack.length === 0) {
        roots.push(node);
      } else {
        stack[stack.length - 1]!.children.push(node);
      }
      stack.push(node);
    } else if (ev.kind === "fn_return") {
      const current = stack.pop();
      if (current && ev.returnValue) {
        current.returnValue = decodeArgument(ev.returnValue, 0);
      }
    } else if (ev.kind === "fn_error") {
      const current = stack.pop();
      if (current) {
        current.status = "failed";
        current.errorMessage = ev.errorMessage ?? "Invocation trapped";
      }
    } else if (ev.kind === "transfer" && ev.transfer) {
      const active = stack[stack.length - 1] ?? roots[roots.length - 1];
      if (active) {
        active.transfers.push({
          nodeId: active.nodeId,
          ...ev.transfer,
        });
      }
    }
  }

  return roots;
}
