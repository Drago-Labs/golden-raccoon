import { NextResponse } from "next/server";

/**
 * Stable API error contract shared by every HTTP route. Machine codes are
 * intentionally kept as `string` (not a closed enum) so existing route-local
 * codes (e.g. "wallet_session_disabled", "chain_family_mismatch") can be
 * reused as-is instead of forcing a lossy remap to a generic taxonomy.
 */
export type ApiErrorCode = string;

export interface ApiErrorShape {
  code: ApiErrorCode;
  message: string;
  retryable: boolean;
  requestId: string;
  details?: unknown;
}

/** Common, reusable machine codes. Routes may use their own instead. */
export const commonErrorCodes = {
  validationError: "validation_error",
  notFound: "not_found",
  unauthorized: "unauthorized",
  forbidden: "forbidden",
  rateLimited: "rate_limited",
  providerError: "provider_error",
  paymentRequired: "payment_required",
  internalError: "internal_error",
  conflict: "conflict",
  policyBlocked: "policy_blocked",
} as const;

const RETRYABLE_CODES: ReadonlySet<ApiErrorCode> = new Set([
  commonErrorCodes.rateLimited,
  commonErrorCodes.providerError,
  commonErrorCodes.internalError,
]);

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly retryable: boolean;
  readonly details?: unknown;

  constructor(
    code: ApiErrorCode,
    message: string,
    status: number,
    options?: { retryable?: boolean; details?: unknown },
  ) {
    super(message);
    this.code = code;
    this.status = status;
    this.retryable = options?.retryable ?? RETRYABLE_CODES.has(code);
    this.details = options?.details;
  }
}

let requestCounter = 0;

/** Deterministic-enough, dependency-free request id for correlating error responses. */
export function createRequestId(prefix = "req"): string {
  requestCounter = (requestCounter + 1) % Number.MAX_SAFE_INTEGER;
  return `${prefix}_${Date.now().toString(36)}_${requestCounter.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function toErrorShape(error: ApiError, requestId: string = createRequestId()): ApiErrorShape {
  return {
    code: error.code,
    message: error.message,
    retryable: error.retryable,
    requestId,
    ...(error.details !== undefined ? { details: error.details } : {}),
  };
}

export interface JsonErrorInput {
  code: ApiErrorCode;
  message: string;
  status: number;
  retryable?: boolean;
  details?: unknown;
}

export interface JsonErrorOptions {
  requestId?: string;
  /**
   * Extra top-level fields merged alongside the stable error shape, used to
   * preserve a pre-existing response shape (e.g. `{ error: "..." }`) for
   * clients that have not migrated to the stable contract yet.
   */
  legacy?: Record<string, unknown>;
  headers?: Record<string, string>;
}

/**
 * Builds a JSON error response with the stable `{ code, message, retryable,
 * requestId, details? }` shape. Pass `legacy` to additively include a route's
 * pre-existing fields (e.g. `error`, `detail`) for backward compatibility.
 */
export function jsonError(input: ApiError | JsonErrorInput, options?: JsonErrorOptions): NextResponse {
  const apiError =
    input instanceof ApiError
      ? input
      : new ApiError(input.code, input.message, input.status, { retryable: input.retryable, details: input.details });
  const requestId = options?.requestId ?? createRequestId();
  const body = { ...toErrorShape(apiError, requestId), ...(options?.legacy ?? {}) };

  return NextResponse.json(body, {
    status: apiError.status,
    headers: { "Cache-Control": "no-store", ...(options?.headers ?? {}) },
  });
}
