# Merkle claims — sources and limits

## Sources

On-chain facts (`merkleRoot()`, `token()`, `isClaimed(index)`) come from
standard `eth_call` against the RPC endpoint configured for the selected
network in `@/lib/evm/config`. The tree file itself comes from a live
fetch through this codebase's shared `readPublicHttpsText` fetcher
(`@/server/security/publicHttpsText`): HTTPS-only, DNS-pinned, with a
bounded byte cap and timeout. An `ipfs://` reference or a bare CID is
translated to a public gateway URL before fetching; a plain (non-HTTPS)
`http://` source is rejected outright.

## Trust assumptions

- **The on-chain root is the only thing this feature trusts as ground
  truth.** The tree file's own self-reported `merkleRoot` field is
  compared against it purely as a cheap, informational sanity check — a
  tampered file can self-report any root value it likes, so that
  comparison never by itself makes a claim eligible or ineligible.
- **Eligibility rests entirely on the cryptographic proof check**: the
  target address's leaf (built from the tree file's `index`/`amount` under
  the caller-selected encoding) is folded up through the entry's own
  `proof` array and compared to the on-chain root. If that does not match,
  the claim is reported ineligible regardless of anything else the file
  says — this is what "a root mismatch blocks any eligibility claim" means
  in practice. A tampered amount, a tampered proof sibling, or a proof
  checked with the wrong leaf encoding all fail this exact check.
- **Leaf encoding is never guessed.** `leafEncoding.ts` implements three
  named, explicit encodings (`index-account-amount-packed`, matching the
  original Uniswap `merkle-distributor`; `account-amount-packed`, a common
  index-less variant; and `account-amount-abi-double-hashed`, matching
  OpenZeppelin's `StandardMerkleTree` leaf convention). The caller (a
  person, or a saved per-distributor config) must pick one explicitly.
  Picking the wrong one for a given contract will make every proof in that
  tree fail verification — this looks identical to a genuinely tampered
  tree from this feature's point of view, and is a real, documented
  failure mode worth checking first if every entry in an otherwise
  legitimate distribution comes back invalid.
- **Only the sorted-pair ("commutative") hash convention is supported**
  for folding a proof (`merkleHash.ts`'s `hashPair`), matching
  OpenZeppelin's `MerkleProof.sol` — the convention the overwhelming
  majority of real-world distributor contracts use, directly or via a
  near-identical reimplementation. A distributor using positional
  (non-commutative) pairing is not supported and will not verify here.
- **The whole tree is never reconstructed from all its leaves.** Proof
  verification is deliberately per-entry and algorithm-agnostic about how
  the tree was built — it only needs `hashPair` to match the contract's
  own convention, never the specific shape (padding, ordering, odd-node
  handling) a particular third-party generator used to build the tree.
  This feature makes no claim about whether any *other* address's entry
  in the file is genuine.

## Limits

- A single RPC request or tree-file fetch times out after `RPC_TIMEOUT_MS`
  / `TREE_FETCH_TIMEOUT_MS` respectively.
- A tree file larger than `MAX_TREE_BYTES` is rejected rather than read
  into memory in full.
- A proof longer than `MAX_PROOF_LENGTH` siblings is rejected outright
  rather than folded — no legitimate tree over any realistic claim list
  needs anywhere near that many levels.
