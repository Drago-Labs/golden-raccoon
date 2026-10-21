export type DiagnosisState = "complete" | "partial" | "unavailable";

export type TxFailureErrorCode = "invalid_request" | "invalid_xdr" | "not_found" | "response_too_large";

export class TxFailureDiagnosticsError extends Error {
  readonly code: TxFailureErrorCode;
  readonly details?: unknown;

  constructor(code: TxFailureErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "TxFailureDiagnosticsError";
    this.code = code;
    this.details = details;
  }
}
