/** How complete a delegate's or a report's evidence is. */
export type DelegateState = "complete" | "partial" | "unavailable";

export type DelegateErrorCode =
  | "invalid_request"
  | "unsupported_governor"
  | "malformed_response"
  | "provider_unavailable";

export class DelegateParticipationError extends Error {
  constructor(
    public readonly code: DelegateErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "DelegateParticipationError";
  }
}
