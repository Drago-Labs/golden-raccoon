export type DeployerHistoryErrorKind =
  | "invalid_request"
  | "unsupported_network"
  | "provider_unavailable"
  | "rate_limited"
  | "deployer_not_found";

export class DeployerHistoryError extends Error {
  constructor(
    message: string,
    readonly kind: DeployerHistoryErrorKind,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

/**
 * - `complete`: the deployer was found and every scan stayed within its
 *   window without truncation.
 * - `partial`: the deployer was found, but at least one scan window was
 *   truncated or a sub-read failed.
 * - `unavailable`: the provider could not be reached at all.
 */
export type DeployerHistoryState = "complete" | "partial" | "unavailable";
