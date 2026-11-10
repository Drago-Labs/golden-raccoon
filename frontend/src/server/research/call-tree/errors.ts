export type CallTreeErrorKind =
  | "invalid_request"
  | "unsupported_network"
  | "provider_unavailable"
  | "payload_too_large";

export class CallTreeError extends Error {
  constructor(
    message: string,
    readonly kind: CallTreeErrorKind,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "CallTreeError";
  }
}

export type CallTreeState = "complete" | "partial" | "unavailable";
