export type QuorumState = "complete" | "partial" | "unavailable";

export type QuorumErrorCode = "invalid_request" | "invalid_quorum" | "response_too_large";

export class QuorumMapError extends Error {
  readonly code: QuorumErrorCode;
  readonly details?: unknown;

  constructor(code: QuorumErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "QuorumMapError";
    this.code = code;
    this.details = details;
  }
}
