/**
 * Typed error and state union for the merkle-claims feature. Kept separate
 * so every module that can fail (not just the RPC layer) shares one
 * vocabulary.
 */

export type MerkleClaimsErrorKind =
  | "invalid_request"
  | "unsupported_network"
  | "provider_unavailable"
  | "rate_limited";

export class MerkleClaimsError extends Error {
  constructor(
    message: string,
    readonly kind: MerkleClaimsErrorKind,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

/**
 * - `complete`: the on-chain root was read, the tree loaded, and the
 *   target claim's proof was checked against the on-chain root.
 * - `partial`: the chain responded, but the tree could not be loaded or
 *   did not contain the target address.
 * - `unavailable`: the chain provider could not be reached at all.
 */
export type MerkleClaimsState = "complete" | "partial" | "unavailable";
