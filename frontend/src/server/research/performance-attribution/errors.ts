/** How complete a period's or a report's evidence is. */
export type AttributionState = "complete" | "partial" | "unavailable";

export type AttributionErrorCode = "invalid_request" | "identity_mismatch" | "malformed_snapshot" | "provider_unavailable";

export class AttributionError extends Error {
  constructor(
    public readonly code: AttributionErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AttributionError";
  }
}
