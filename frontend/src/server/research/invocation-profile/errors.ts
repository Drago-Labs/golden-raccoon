export type ErrorCode =
  | "invalid_request"
  | "invalid_contract"
  | "not_found"
  | "response_too_large"
  | "timeout"
  | "provider_unavailable";

/** Feature readiness for a profiled contract window. */
export type InvocationProfileState = "complete" | "partial" | "unavailable";

export class InvocationProfileError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "InvocationProfileError";
  }
}
