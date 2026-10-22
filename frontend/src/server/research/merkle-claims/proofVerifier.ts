import type { Hex } from "viem";
import { computeLeaf, type LeafEncoding } from "./leafEncoding";
import { verifyProof, type ProofVerification } from "./merkleHash";
import type { TreeClaimEntry } from "./treeLoader";

export type ClaimProofResult = {
  leaf: Hex;
  verification: ProofVerification;
};

/**
 * Builds the leaf for one tree entry under the selected encoding, then
 * checks its proof against the on-chain root. This is deliberately
 * per-entry and algorithm-agnostic about how the whole tree was built —
 * it never tries to reconstruct the full tree from every leaf, which
 * would require assuming one specific generator's pairing/ordering
 * convention. A proof that folds up to the real on-chain root is proof
 * this entry is genuinely part of the committed tree, regardless of how
 * the tree was generated.
 */
export function verifyClaimEntry(encoding: LeafEncoding, account: string, entry: TreeClaimEntry, onChainRoot: Hex): ClaimProofResult {
  const leaf = computeLeaf(encoding, { index: BigInt(entry.index), account, amount: BigInt(entry.amount) });
  const verification = verifyProof(leaf, entry.proof as Hex[], onChainRoot);
  return { leaf, verification };
}
