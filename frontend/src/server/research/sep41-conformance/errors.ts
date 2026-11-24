/**
 * Typed error and state union for the SEP-41 conformance feature.
 */

export type Sep41ConformanceErrorKind =
  | "invalid_request"
  | "invalid_contract"
  | "unsupported_network"
  | "provider_unavailable"
  | "spec_unavailable"
  | "response_too_large";

export class Sep41ConformanceError extends Error {
  constructor(
    readonly kind: Sep41ConformanceErrorKind,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "Sep41ConformanceError";
  }
}

/**
 * - `complete`: spec, simulations, and event sampling all succeeded.
 * - `partial`: the contract responded, but some reads or event pages failed.
 * - `unavailable`: the provider could not be reached at all.
 */
export type Sep41ConformanceState = "complete" | "partial" | "unavailable";
