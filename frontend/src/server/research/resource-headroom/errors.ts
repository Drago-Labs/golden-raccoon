export type ResourceHeadroomErrorKind =
  | "invalid_request"
  | "unsupported_network"
  | "network_mismatch"
  | "provider_unavailable"
  | "payload_too_large";

export class ResourceHeadroomError extends Error {
  constructor(
    message: string,
    readonly kind: ResourceHeadroomErrorKind,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "ResourceHeadroomError";
  }
}

export type ResourceHeadroomState = "complete" | "partial" | "unavailable";
