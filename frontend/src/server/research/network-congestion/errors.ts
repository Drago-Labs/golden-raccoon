/**
 * Failures and view states for ledger-capacity explanation.
 *
 * A missing ledger is not a zero, and a provider failure is not an empty
 * window. Callers match on `code` or `status` instead of parsing sentences.
 */

export const CONGESTION_ERROR_CODES = [
  "invalid_request",
  "unknown_network",
  "window_inverted",
  "window_too_large",
  "ledger_not_found",
  "timestamp_not_closed",
  "timestamp_unresolved",
  "provider_unavailable",
  "provider_timeout",
  "passphrase_mismatch",
] as const;

export type CongestionErrorCode = (typeof CONGESTION_ERROR_CODES)[number];

/** How much of the requested ledger range the statistics actually cover. */
export type CoverageKind = "complete" | "partial" | "empty" | "unavailable";

export class NetworkCongestionError extends Error {
  readonly code: CongestionErrorCode;
  readonly details?: unknown;

  constructor(code: CongestionErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "NetworkCongestionError";
    this.code = code;
    this.details = details;
  }
}

/**
 * The workbench's states.
 *
 * `ready` carries a report. `error` carries a code. There is no state in
 * which a failed read is rendered as a window of zero fees.
 */
export type CongestionViewState<TReport> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; report: TReport }
  | { status: "error"; code: CongestionErrorCode; message: string };
