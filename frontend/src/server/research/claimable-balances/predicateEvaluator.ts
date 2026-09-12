import type { PredicateNode, Truth } from "./schema";

export function evaluatePredicate(node: PredicateNode, context: { ledgerCloseEpochSeconds: bigint; createdAtEpochSeconds?: bigint }): Truth {
  if (node.kind === "unconditional") return true;
  if (node.kind === "abs_before") return context.ledgerCloseEpochSeconds < BigInt(node.epochSeconds);
  if (node.kind === "rel_before") return context.createdAtEpochSeconds === undefined ? "unknown" : context.ledgerCloseEpochSeconds < context.createdAtEpochSeconds + BigInt(node.seconds);
  if (node.kind === "not") { const child = evaluatePredicate(node.child, context); return child === "unknown" ? "unknown" : !child; }
  const values = node.children.map((child) => evaluatePredicate(child, context));
  if (node.kind === "and") return values.includes(false) ? false : values.includes("unknown") ? "unknown" : true;
  return values.includes(true) ? true : values.includes("unknown") ? "unknown" : false;
}
