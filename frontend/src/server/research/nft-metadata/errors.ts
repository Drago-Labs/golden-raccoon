/**
 * Typed error and state union for the nft-metadata feature. Kept separate
 * so every module that can fail (not just the RPC layer) shares one
 * vocabulary.
 */

export type NftMetadataErrorKind =
  | "invalid_request"
  | "unsupported_network"
  | "provider_unavailable"
  | "rate_limited";

export class NftMetadataError extends Error {
  constructor(
    message: string,
    readonly kind: NftMetadataErrorKind,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

/**
 * - `complete`: the standard was detected and every sampled token resolved.
 * - `partial`: the collection responded, but the standard could not be
 *   detected, a sample failed to resolve, or a scan window was truncated.
 * - `unavailable`: the chain provider could not be reached at all.
 */
export type NftMetadataState = "complete" | "partial" | "unavailable";
