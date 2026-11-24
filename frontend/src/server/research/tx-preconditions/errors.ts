/**
 * Typed failures and the evaluation state union for transaction preconditions.
 * Callers branch on `code` or `state` instead of parsing message text.
 */

export type EvaluationState = "complete" | "partial" | "unavailable";

export type TxPreconditionsErrorCode =
  | "invalid_request"
  | "invalid_json"
  | "invalid_xdr"
  | "payload_too_large"
  | "response_too_large"
  | "provider_unavailable";

export class TxPreconditionsError extends Error {
  readonly code: TxPreconditionsErrorCode;
  readonly details?: unknown;

  constructor(code: TxPreconditionsErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "TxPreconditionsError";
    this.code = code;
    this.details = details;
  }
}
