/**
 * Unified nonce contract types for single-use, per-address authentication challenges.
 */

export type NonceFamily = "evm" | "stellar";

export type NonceStatus =
  | "valid"
  | "already_used"
  | "address_mismatch"
  | "family_mismatch"
  | "expired"
  | "not_found";

export interface NonceRecord {
  /** The cryptographically random nonce string. */
  nonce: string;
  /** The canonical wallet address the nonce is bound to. */
  walletAddress: string;
  /** The chain family the nonce was issued for. */
  family: NonceFamily;
  /** Optional network or chain context. */
  network?: string | null;
  /** Unix timestamp in milliseconds when minted. */
  issuedAt: number;
  /** Unix timestamp in milliseconds when the nonce expires. */
  expiresAt: number;
  /** Unix timestamp in milliseconds when the nonce was consumed, if used. */
  usedAt?: number;
}

export interface MintNonceOptions {
  /** Target wallet address. */
  walletAddress: string;
  /** Target chain family. */
  family: NonceFamily;
  /** Optional target network. */
  network?: string | null;
  /** Time-to-live in seconds. Defaults to 300 (5 minutes). */
  ttlSeconds?: number;
  /** Optional override for the random nonce value (primarily for testing). */
  customNonce?: string;
}

export interface VerifyNonceOptions {
  /** The nonce string to verify. */
  nonce: string;
  /** The wallet address attempting to consume the nonce. */
  walletAddress: string;
  /** The chain family of the attempting consumer. */
  family: NonceFamily;
  /** Whether to mark the nonce as consumed immediately on success. Defaults to true. */
  consume?: boolean;
  /** Optional reference timestamp for expiration calculation. */
  now?: number;
}

export interface NonceVerificationResult {
  /** True only if the nonce is valid, unconsumed, unexpired, and address-matched. */
  ok: boolean;
  /** Detailed classification status. */
  status: NonceStatus;
  /** The verified nonce record, if found. */
  record?: NonceRecord;
  /** Human-readable explanation when verification fails. */
  error?: string;
}
