export type VolatilityProfileErrorKind =
  | "invalid_request"
  | "unsupported_asset"
  | "mismatched_interval"
  | "provider_unavailable";

export class VolatilityProfileError extends Error {
  constructor(
    message: string,
    readonly kind: VolatilityProfileErrorKind,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "VolatilityProfileError";
  }
}

export type VolatilityProfileState = "complete" | "partial" | "unavailable";
