export type IssuanceLedgerState = "complete" | "partial" | "unavailable";

export type IssuanceLedgerErrorCode = "invalid_request" | "not_found" | "response_too_large";

export class IssuanceLedgerError extends Error {
  readonly code: IssuanceLedgerErrorCode;
  readonly details?: unknown;

  constructor(code: IssuanceLedgerErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "IssuanceLedgerError";
    this.code = code;
    this.details = details;
  }
}
