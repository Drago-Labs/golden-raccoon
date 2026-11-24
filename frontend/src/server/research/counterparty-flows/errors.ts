export type CounterpartyState = "complete" | "partial" | "unavailable";

export type CounterpartyErrorCode =
  | "invalid_request"
  | "not_found"
  | "response_too_large"
  | "timeout";

export class CounterpartyFlowsError extends Error {
  readonly code: CounterpartyErrorCode;
  readonly details?: unknown;

  constructor(code: CounterpartyErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "CounterpartyFlowsError";
    this.code = code;
    this.details = details;
  }
}
