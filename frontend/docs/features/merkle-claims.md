# Merkle distributor claim verification

A read-only verifier for Merkle-based airdrop and distribution contracts:
checks whether an address is really in a published distribution, whether
its proof actually folds up to the distributor's on-chain root, and
whether it has already been claimed — so a phishing site asking someone to
sign a claim transaction for a distribution they were never part of is
visible before they sign, not after.

## What it checks

- **On-chain state**: reads `merkleRoot()` and `token()` from the
  distributor contract at a recorded (or latest) block.
- **Tree loading**: fetches a published tree file from a caller-supplied
  HTTPS URL, `ipfs://` reference, or bare IPFS CID, with a size limit and a
  timeout. The expected shape is the common `{ merkleRoot, claims: { [address]: { index, amount, proof } } }`
  format produced by the Uniswap `merkle-distributor` reference generator
  and its many derivatives.
- **Leaf encoding**: the caller must select, explicitly, which of three
  named encodings the target distributor uses — there is no safe default,
  since guessing wrong would silently "prove" a forged claim invalid or
  (worse) make a real one look unverifiable.
- **Proof verification**: builds the leaf for the target address's tree
  entry under the selected encoding, then folds it up through the entry's
  proof using the standard OpenZeppelin `MerkleProof` sorted-pair
  convention, and compares the result to the on-chain root. This is
  algorithm-agnostic about how the tree was built — it never tries to
  reconstruct the whole tree from every leaf.
- **Claim status**: reads `isClaimed(index)` for the verified entry's
  index.

## Scope and limits

- Read-only. No transaction-submission, signing, or claim-filing action
  exists in this feature.
- Only the OpenZeppelin-style sorted-pair hash convention is implemented
  for folding a proof. A distributor using a different, non-commutative
  pairing convention will not verify here, and is reported as such rather
  than silently mismatched.
- The whole-tree root is never independently reconstructed from every
  leaf — only the target address's own entry is proof-checked against the
  on-chain root. A root mismatch on that one proof is enough to block
  eligibility; it does not require (and this feature does not attempt)
  validating every other entry in the file.
- Does not submit claims, sign anything, or change any risk score.

## Run the focused suite

```
npm run test -- --run tests/features/merkle-claims
```
