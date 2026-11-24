/** How complete a chain's or a report's evidence is. */
export type FlowState = "complete" | "partial" | "unavailable";

export type FlowErrorCode = "invalid_request" | "unknown_asset" | "unsupported_chain" | "malformed_response";

export class StablecoinFlowError extends Error {
  constructor(
    public readonly code: FlowErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "StablecoinFlowError";
  }
}
