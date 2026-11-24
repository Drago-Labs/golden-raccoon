export type ClmmErrorCode =
  | "invalid_request"
  | "not_found"
  | "provider_unavailable"
  | "response_too_large"
  | "timeout"
  | "unsupported_deployment";

export type ClmmReportState = "complete" | "partial" | "unavailable";

export class ClmmPositionsError extends Error {
  constructor(
    public readonly code: ClmmErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ClmmPositionsError";
  }
}
