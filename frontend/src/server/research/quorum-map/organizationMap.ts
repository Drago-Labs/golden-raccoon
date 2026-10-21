import type { QuorumSetNode } from "./schema";

export type ValidatorNode = {
  publicKey: string;
  organization: string | null;
  homeDomain: string | null;
  quorumSet: QuorumSetNode | null;
};

export function organizationOf(nodes: ValidatorNode[]): (key: string) => string | null {
  const byKey = new Map(nodes.map((node) => [node.publicKey, node.organization]));
  return (key) => byKey.get(key) ?? null;
}

export function collectKeys(set: QuorumSetNode): string[] {
  return [...set.validators, ...set.innerSets.flatMap((inner) => collectKeys(inner))];
}

/** Keys that appear in a quorum set and are absent from the node list stay visible. */
export function unresolvedKeys(nodes: ValidatorNode[]): string[] {
  const known = new Set(nodes.map((node) => node.publicKey));
  const found = new Set<string>();
  for (const node of nodes) {
    if (!node.quorumSet) continue;
    for (const key of collectKeys(node.quorumSet)) {
      if (!known.has(key)) found.add(key);
    }
  }
  return [...found].sort();
}
