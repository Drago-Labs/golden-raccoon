/**
 * Typed failure codes and the analysis state union for holder distribution.
 *
 * Invalid input throws `HolderDistributionError`. A provider that cannot be
 * read does not throw: the report's `state` is `unavailable`, so the page can
 * say what is missing instead of inventing a distribution.
 */

export const ANALYSIS_STATES = ["complete", "partial", "empty", "unavailable"] as const;

export type AnalysisState = (typeof ANALYSIS_STATES)[number];

export const HOLDER_ERROR_CODES = [
  "invalid_json",
  "invalid_request",
  "invalid_asset",
  "unsupported_network",
  "payload_too_large",
  "provider_unavailable",
] as const;

export type HolderErrorCode = (typeof HOLDER_ERROR_CODES)[number];

export class HolderDistributionError extends Error {
  readonly code: HolderErrorCode;
  readonly details?: unknown;

  constructor(code: HolderErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "HolderDistributionError";
    this.code = code;
    this.details = details;
  }
}
