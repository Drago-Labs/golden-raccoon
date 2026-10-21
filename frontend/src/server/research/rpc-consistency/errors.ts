/**
 * Typed failures and provider states for one Horizon / RPC comparison.
 *
 * A provider that cannot be read is a state, not an exception: the check
 * continues on the remaining source and says so. Mixing testnet with mainnet
 * is an error, because those answers are not about the same ledger.
 */

export const CONSISTENCY_ERROR_CODES = [
  "invalid_json",
  "invalid_request",
  "invalid_target",
  "invalid_network",
  "payload_too_large",
  "network_mismatch",
] as const;

export type ConsistencyErrorCode = (typeof CONSISTENCY_ERROR_CODES)[number];

export class RpcConsistencyError extends Error {
  readonly code: ConsistencyErrorCode;
  readonly details?: unknown;

  constructor(code: ConsistencyErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "RpcConsistencyError";
    this.code = code;
    this.details = details;
  }
}

/** A provider either returned an observation or it did not. There is no guessed third state. */
export type ProviderState<T> =
  | { status: "available"; observation: T }
  | { status: "unavailable"; message: string };

export function available<T>(observation: T): ProviderState<T> {
  return { status: "available", observation };
}

export function unavailable<T>(message: string): ProviderState<T> {
  return { status: "unavailable", message };
}

export function isRpcConsistencyError(error: unknown): error is RpcConsistencyError {
  return error instanceof RpcConsistencyError;
}
