export class ReadClientError extends Error {
  constructor(
    public readonly kind: "http" | "transport" | "compatibility" | "configuration",
    message: string,
    public readonly status?: number,
    public readonly code?: string,
    public readonly retryable = false,
    public readonly requestId?: string,
  ) { super(message); this.name = "ReadClientError"; }
}

export class CompatibilityError extends ReadClientError {
  constructor(public readonly path: string) {
    super("compatibility", `Unexpected API response shape at ${path}.`);
    this.name = "CompatibilityError";
  }
}

export function httpError(status: number, body: unknown): ReadClientError {
  const object = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const code = typeof object.code === "string" ? object.code
    : typeof object.error === "string" ? object.error : `http_${status}`;
  // Do not retain response bodies, credentials, URLs or wallet identifiers in errors.
  return new ReadClientError("http", `Read API request failed (HTTP ${status}).`, status,
    code, typeof object.retryable === "boolean" ? object.retryable : status === 429 || status === 503,
    typeof object.requestId === "string" ? object.requestId : undefined);
}
