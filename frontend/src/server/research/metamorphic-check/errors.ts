export type MetamorphicCheckErrorKind =
  | "invalid_request"
  | "unsupported_network"
  | "provider_unavailable";

export class MetamorphicCheckError extends Error {
  constructor(
    message: string,
    readonly kind: MetamorphicCheckErrorKind,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "MetamorphicCheckError";
  }
}

export type MetamorphicCheckState = "complete" | "partial" | "unavailable";
