export type DelegationState = "idle" | "loading" | "ready" | "error";
export class DelegationInspectionError extends Error { constructor(public code: "provider_unavailable" | "invalid_input", message: string) { super(message); } }
