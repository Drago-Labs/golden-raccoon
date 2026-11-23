/** Typed outcomes for the privileged-key inventory. A missing provider is a state, not a throw. */
export type WorkState<T> =
  | { kind: "ready"; report: T }
  | { kind: "unavailable"; reason: string }
  | { kind: "unknown_format"; reason: string };

export class PrivilegedKeysError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "PrivilegedKeysError";
    this.code = code;
  }
}
