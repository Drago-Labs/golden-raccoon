export type EventDecoderErrorKind =
  | "invalid_request"
  | "unsupported_network"
  | "provider_unavailable"
  | "payload_too_large";

export class EventDecoderError extends Error {
  constructor(
    message: string,
    readonly kind: EventDecoderErrorKind,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "EventDecoderError";
  }
}

export type EventDecoderState = "complete" | "partial" | "unavailable";
