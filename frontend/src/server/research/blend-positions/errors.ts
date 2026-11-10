export type BlendPositionErrorKind =
  | "invalid_request"
  | "unsupported_network"
  | "pool_mismatch"
  | "provider_unavailable"
  | "payload_too_large";

export class BlendPositionError extends Error {
  constructor(
    message: string,
    readonly kind: BlendPositionErrorKind,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "BlendPositionError";
  }
}

export type BlendPositionState = "complete" | "partial" | "unavailable";
