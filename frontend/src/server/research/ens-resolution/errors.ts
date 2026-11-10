export type EnsResolutionErrorKind =
  | "invalid_request"
  | "invalid_ens_name"
  | "unsupported_network"
  | "provider_unavailable";

export class EnsResolutionError extends Error {
  constructor(
    message: string,
    readonly kind: EnsResolutionErrorKind,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "EnsResolutionError";
  }
}

export type EnsResolutionState = "complete" | "partial" | "unavailable";
