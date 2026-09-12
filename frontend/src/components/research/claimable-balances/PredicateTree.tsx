import type { PredicateNode } from "@/server/research/claimable-balances/schema";
export function PredicateTree({ node }: { node: PredicateNode | null }) {
  if (!node) return <span>Predicate unavailable</span>;
  const label = node.kind === "abs_before" ? `Before epoch ${node.epochSeconds}` : node.kind === "rel_before" ? `Within ${node.seconds} seconds of creation` : node.kind;
  const children = node.kind === "and" || node.kind === "or" ? node.children : node.kind === "not" ? [node.child] : [];
  return <div role="treeitem" aria-selected="false" aria-expanded={children.length ? true : undefined} tabIndex={0} className="rounded-lg border border-white/10 p-2"><span className="text-xs uppercase text-white/60">{label}</span>{children.length ? <div role="group" className="ml-3 mt-2 space-y-2 border-l border-white/10 pl-3">{children.map((child, index) => <PredicateTree key={index} node={child} />)}</div> : null}</div>;
}
