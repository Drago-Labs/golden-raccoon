export type SacBindingErrorKind =
  | "invalid_request"
  | "invalid_asset"
  | "unsupported_network"
  | "provider_unavailable"
  | "payload_too_large";

export class SacBindingError extends Error {
  constructor(
    message: string,
    readonly kind: SacBindingErrorKind,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "SacBindingError";
  }
}

export type SacBindingState = "complete" | "partial" | "unavailable";
