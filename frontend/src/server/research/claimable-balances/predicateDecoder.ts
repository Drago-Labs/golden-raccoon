import type { PredicateNode } from "./schema";

export function decodePredicate(value: unknown, limits = { depth: 8, nodes: 64 }): PredicateNode {
  let nodes = 0;
  function visit(input: unknown, depth: number): PredicateNode {
    nodes += 1;
    if (depth > limits.depth || nodes > limits.nodes) throw new Error("Predicate complexity limit exceeded");
    if (!input || typeof input !== "object") throw new Error("Malformed predicate");
    const record = input as Record<string, unknown>;
    if (record.unconditional === true) return { kind: "unconditional" };
    if (typeof record.abs_before === "string" && /^\d+$/.test(record.abs_before)) return { kind: "abs_before", epochSeconds: record.abs_before };
    if (typeof record.rel_before === "string" && /^\d+$/.test(record.rel_before)) return { kind: "rel_before", seconds: record.rel_before };
    if (Array.isArray(record.and) && record.and.length >= 2 && record.and.length <= 10) return { kind: "and", children: record.and.map((child) => visit(child, depth + 1)) };
    if (Array.isArray(record.or) && record.or.length >= 2 && record.or.length <= 10) return { kind: "or", children: record.or.map((child) => visit(child, depth + 1)) };
    if (record.not) return { kind: "not", child: visit(record.not, depth + 1) };
    throw new Error("Unsupported predicate payload");
  }
  return visit(value, 0);
}
