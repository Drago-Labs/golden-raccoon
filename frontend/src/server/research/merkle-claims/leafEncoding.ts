import { encodeAbiParameters, encodePacked, keccak256, parseAbiParameters, type Hex } from "viem";

/**
 * Named, explicit leaf encodings this feature knows how to reproduce. There
 * is no single standard for a distributor's leaf — the caller (or a saved
 * per-distributor config) must say which one this contract uses, rather
 * than this feature guessing from the file alone.
 */
export type LeafEncoding = "index-account-amount-packed" | "account-amount-packed" | "account-amount-abi-double-hashed";

export const LEAF_ENCODINGS: readonly LeafEncoding[] = [
  "index-account-amount-packed",
  "account-amount-packed",
  "account-amount-abi-double-hashed",
];

export type ClaimEntryFields = {
  index: bigint;
  account: string;
  amount: bigint;
};

/**
 * - `index-account-amount-packed`: `keccak256(abi.encodePacked(index, account, amount))`
 *   — the original Uniswap `merkle-distributor` reference implementation.
 * - `account-amount-packed`: `keccak256(abi.encodePacked(account, amount))`
 *   — a common index-less variant.
 * - `account-amount-abi-double-hashed`: `keccak256(keccak256(abi.encode(account, amount)))`
 *   — OpenZeppelin's `StandardMerkleTree` leaf convention, double-hashed to
 *   avoid a second-preimage ambiguity between a leaf and an internal node.
 */
export function computeLeaf(encoding: LeafEncoding, fields: ClaimEntryFields): Hex {
  switch (encoding) {
    case "index-account-amount-packed":
      return keccak256(encodePacked(["uint256", "address", "uint256"], [fields.index, fields.account as Hex, fields.amount]));
    case "account-amount-packed":
      return keccak256(encodePacked(["address", "uint256"], [fields.account as Hex, fields.amount]));
    case "account-amount-abi-double-hashed":
      return keccak256(keccak256(encodeAbiParameters(parseAbiParameters("address, uint256"), [fields.account as Hex, fields.amount])));
  }
}
