export type CirculatingSupplyState = "complete" | "partial" | "unavailable";
export class CirculatingSupplyError extends Error {
  constructor(public readonly code: "invalid_request" | "provider_unavailable", message: string, public readonly details?: unknown) { super(message); this.name = "CirculatingSupplyError"; }
}
