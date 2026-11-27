export type ErrorCode =
  | "invalid_request"
  | "invalid_contract"
  | "not_found"
  | "response_too_large"
  | "timeout"
  | "provider_unavailable";

export type ReportState = "complete" | "partial" | "unavailable";

export type ComparisonStatus = "agreement" | "conflict" | "absent";

export class WasmSourceMetaError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "WasmSourceMetaError";
  }
}
