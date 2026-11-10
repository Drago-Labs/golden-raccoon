export type EvmTimelockErrorKind =
  | "invalid_request"
  | "unsupported_network"
  | "provider_unavailable";

export class EvmTimelockError extends Error {
  constructor(
    message: string,
    readonly kind: EvmTimelockErrorKind,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "EvmTimelockError";
  }
}

export type EvmTimelockState = "complete" | "partial" | "unavailable";
