export type DomainSignalState = "available" | "unknown";
export class DomainLookalikeError extends Error { constructor(public readonly code: "invalid_request" | "provider_unavailable", message: string, public readonly details?: unknown) { super(message); this.name = "DomainLookalikeError"; } }
