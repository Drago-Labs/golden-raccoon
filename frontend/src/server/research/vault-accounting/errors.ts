/**
 * Typed error and state union for the vault-accounting feature. Kept
 * separate from `vaultReader.ts` so every module that needs to report a
 * failure (not just the RPC layer) shares one vocabulary.
 */

export type VaultAccountingErrorKind =
  | "invalid_request"
  | "unsupported_network"
  | "provider_unavailable"
  | "rate_limited";

export class VaultAccountingError extends Error {
  constructor(
    message: string,
    readonly kind: VaultAccountingErrorKind,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

/**
 * - `complete`: every read this request asked for succeeded.
 * - `partial`: the vault responded, but some reads failed, were
 *   non-conforming, or a sample window was truncated.
 * - `unavailable`: the provider could not be reached at all.
 */
export type VaultAccountingState = "complete" | "partial" | "unavailable";
