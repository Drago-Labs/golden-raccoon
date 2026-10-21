export type ReconciliationState = "complete" | "partial" | "unavailable";

export type BalanceErrorCode = "invalid_request" | "not_found" | "response_too_large";

export class BalanceReconciliationError extends Error {
  readonly code: BalanceErrorCode;
  readonly details?: unknown;

  constructor(code: BalanceErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "BalanceReconciliationError";
    this.code = code;
    this.details = details;
  }
}
