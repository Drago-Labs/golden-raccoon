export type EntryState = "complete" | "partial" | "unavailable";

export type DataEntryErrorCode = "invalid_request" | "not_found" | "response_too_large";

export class DataEntryError extends Error {
  readonly code: DataEntryErrorCode;
  readonly details?: unknown;

  constructor(code: DataEntryErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "DataEntryError";
    this.code = code;
    this.details = details;
  }
}
