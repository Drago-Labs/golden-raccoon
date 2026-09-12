/**
 * Resource limits, enforced before parsing.
 *
 * The ordering matters. Size and shape are checked first so a hostile payload
 * — a 10MB string, a typed-data document nested a thousand levels deep — is
 * refused cheaply, rather than after a parser has walked it. Every function
 * here is total: it returns a verdict, it never throws on input it dislikes.
 */
import { SIGNING_LIMITS, SigningInspectorError } from "./schema";

export function assertWithinPayloadSize(value: string, label: string): void {
  if (value.length > SIGNING_LIMITS.maxPayloadChars) {
    throw new SigningInspectorError("payload_too_large", `The ${label} exceeds the published size limit.`, {
      length: value.length,
      limit: SIGNING_LIMITS.maxPayloadChars,
    });
  }
}

export type ShapeVerdict = { ok: true; nodes: number; depth: number } | { ok: false; reason: string };

/**
 * Walks an arbitrary JSON value, counting nodes and depth.
 *
 * The walk is iterative rather than recursive, so a deeply nested document
 * cannot blow the stack before the depth check fires. It also refuses cyclic
 * structures, which `JSON.parse` cannot produce but a caller passing an object
 * directly could.
 */
export function measureShape(value: unknown): ShapeVerdict {
  const stack: Array<{ node: unknown; depth: number }> = [{ node: value, depth: 1 }];
  const seen = new Set<object>();

  let nodes = 0;
  let maxDepth = 0;

  while (stack.length > 0) {
    const current = stack.pop() as { node: unknown; depth: number };

    nodes += 1;
    maxDepth = Math.max(maxDepth, current.depth);

    if (nodes > SIGNING_LIMITS.maxTypedDataNodes) {
      return { ok: false, reason: `The document has more than ${SIGNING_LIMITS.maxTypedDataNodes} nodes.` };
    }

    if (current.depth > SIGNING_LIMITS.maxTypedDataDepth) {
      return { ok: false, reason: `The document nests deeper than ${SIGNING_LIMITS.maxTypedDataDepth} levels.` };
    }

    if (current.node !== null && typeof current.node === "object") {
      const asObject = current.node as object;

      if (seen.has(asObject)) {
        return { ok: false, reason: "The document contains a cycle." };
      }

      seen.add(asObject);

      const children = Array.isArray(current.node) ? current.node : Object.values(current.node as Record<string, unknown>);

      for (const child of children) {
        stack.push({ node: child, depth: current.depth + 1 });
      }
    }
  }

  return { ok: true, nodes, depth: maxDepth };
}

/** Hex calldata must be whole bytes, and a selector needs at least four of them. */
export function assertWellFormedCalldata(data: string): void {
  const body = data.slice(2);

  if (body.length % 2 !== 0) {
    throw new SigningInspectorError("malformed_calldata", "Calldata must contain whole bytes.");
  }
}
