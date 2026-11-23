export type ErrorCode = "invalid_request" | "not_found" | "response_too_large" | "timeout";

export type ReconciliationState = "complete" | "partial" | "unavailable";

export class PoolReturnsError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "PoolReturnsError";
  }
}
