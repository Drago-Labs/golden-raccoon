export type PoolHistoryState = "complete" | "partial" | "unavailable" | "unsupported";

export type PoolHistoryErrorCode = "invalid_request" | "not_found" | "response_too_large" | "timeout";

export class PoolHistoryError extends Error {
  readonly code: PoolHistoryErrorCode;
  readonly details?: unknown;

  constructor(code: PoolHistoryErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "PoolHistoryError";
    this.code = code;
    this.details = details;
  }
}
