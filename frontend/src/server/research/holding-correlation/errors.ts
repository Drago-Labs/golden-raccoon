export type HoldingCorrelationErrorKind =
  | "invalid_request"
  | "unsupported_network"
  | "window_too_large"
  | "provider_unavailable"
  | "rate_limited";

export class HoldingCorrelationError extends Error {
  constructor(
    message: string,
    readonly kind: HoldingCorrelationErrorKind,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "HoldingCorrelationError";
  }
}

export type HoldingCorrelationState = "complete" | "partial" | "unavailable";
