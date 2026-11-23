export type WorkState<T> =
  | { kind: "ready"; report: T }
  | { kind: "unavailable"; reason: string }
  | { kind: "unknown_format"; reason: string };
export class BridgeLatencyError extends Error {
  readonly code: string;
  constructor(code: string, message: string) { super(message); this.name = "BridgeLatencyError"; this.code = code; }
}
