import { concat, keccak256, type Hex } from "viem";
import { MAX_PROOF_LENGTH } from "./limits";

function toBigInt(word: Hex): bigint {
  return BigInt(word);
}

/**
 * OpenZeppelin's commutative pair-hash: the two 32-byte values are sorted
 * (numerically, as big-endian integers) before concatenation, so a proof
 * verifies the same way regardless of which side a sibling sits on. This
 * is the convention `MerkleProof.sol` (and therefore the overwhelming
 * majority of real-world distributor contracts, directly or via a
 * near-identical reimplementation) uses.
 */
export function hashPair(a: Hex, b: Hex): Hex {
  return toBigInt(a) <= toBigInt(b) ? keccak256(concat([a, b])) : keccak256(concat([b, a]));
}

export type ProofVerification = {
  valid: boolean;
  computedRoot: Hex;
  reason: string;
};

/**
 * Folds `leaf` up through `proof`'s sibling hashes and checks the result
 * against `root`. Bounded to `MAX_PROOF_LENGTH` siblings — a legitimate
 * tree over any realistic claim list never needs anywhere near that many
 * levels, so a longer proof is rejected outright rather than folded.
 */
export function verifyProof(leaf: Hex, proof: Hex[], root: Hex): ProofVerification {
  if (proof.length > MAX_PROOF_LENGTH) {
    return { valid: false, computedRoot: leaf, reason: `Proof has ${proof.length} siblings, which exceeds the ${MAX_PROOF_LENGTH}-sibling limit` };
  }

  let computed = leaf;
  for (const sibling of proof) {
    computed = hashPair(computed, sibling);
  }

  const valid = computed.toLowerCase() === root.toLowerCase();
  return { valid, computedRoot: computed, reason: valid ? "proof folds up to the on-chain root" : "proof does not fold up to the on-chain root" };
}
