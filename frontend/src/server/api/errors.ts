import { NextResponse } from "next/server";
import { getCorrelationId } from "@/server/observability/logger/context";
import { getActiveTraceId } from "@/server/observability/tracing/spans";

export type ApiErrorCode =
  | "validation_error"
  | "auth_error"
  | "rate_limited"
  | "provider_timeout"
  | "stale_data"
  | "network_mismatch"
  | "wallet_rejection"
  | "payment_failure"
  | "simulation_failure"
  | "submission_failure"
  | "internal_error"
  // Legacy or provider-specific codes to preserve compatibility
  | "chain_family_mismatch"
  | "invalid_wallet"
  | "invalid_source"
  | "source_wallet_mismatch"
  | "approval_required"
  | "hash_chain_family_mismatch"
  | "network_chain_family_mismatch"
  | "transaction_not_found"
  | "submit_failed"
  | "stellar_disabled"
  | "invalid_payment_proof"
  | "payment_proof_rejected"
  | "duplicate_payment"
  | "expected_effects_mismatch"
  | "incident_mode";

export type RecoveryAction =
  | "retry"
  | "reconnect"
  | "switch_network"
  | "refresh_data"
  | "stop";

export interface ApiErrorShape {
  code: ApiErrorCode;
  message: string;
  retryable: boolean;
  recoveryAction: RecoveryAction;
  requestId: string;
  traceId?: string;
  details?: unknown;
}

export const commonErrorCodes: Record<string, ApiErrorCode> = {
  validationError: "validation_error",
  authError: "auth_error",
  rateLimited: "rate_limited",
  providerTimeout: "provider_timeout",
  staleData: "stale_data",
  networkMismatch: "network_mismatch",
  walletRejection: "wallet_rejection",
  paymentFailure: "payment_failure",
  simulationFailure: "simulation_failure",
  submissionFailure: "submission_failure",
  internalError: "internal_error",
};

const RETRYABLE_CODES: ReadonlySet<ApiErrorCode> = new Set([
  "rate_limited",
  "provider_timeout",
  "stale_data",
  "internal_error",
]);

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly retryable: boolean;
  readonly recoveryAction: RecoveryAction;
  readonly details?: unknown;

  constructor(
    code: ApiErrorCode,
    message: string,
    status: number,
    options?: { retryable?: boolean; recoveryAction?: RecoveryAction; details?: unknown },
  ) {
    super(message);
    this.code = code;
    this.status = status;
    this.retryable = options?.retryable ?? RETRYABLE_CODES.has(code);
    this.recoveryAction = options?.recoveryAction ?? (this.retryable ? "retry" : "stop");
    this.details = options?.details;
    
    if (!this.retryable && this.recoveryAction === "retry") {
      this.recoveryAction = "stop";
    }
  }
}

let requestCounter = 0;

export function createRequestId(prefix = "req"): string {
  requestCounter = (requestCounter + 1) % Number.MAX_SAFE_INTEGER;
  return `${prefix}_${Date.now().toString(36)}_${requestCounter.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function toErrorShape(error: ApiError, requestId: string = createRequestId()): ApiErrorShape {
  return {
    code: error.code,
    message: error.message,
    retryable: error.retryable,
    recoveryAction: error.recoveryAction,
    requestId,
    ...(error.details !== undefined ? { details: error.details } : {}),
  };
}

export interface JsonErrorInput {
  code: ApiErrorCode;
  message: string;
  status: number;
  retryable?: boolean;
  recoveryAction?: RecoveryAction;
  details?: unknown;
}

export interface JsonErrorOptions {
  requestId?: string;
  legacy?: Record<string, unknown>;
  headers?: Record<string, string>;
}

export function jsonError(input: ApiError | JsonErrorInput, options?: JsonErrorOptions): NextResponse {
  const apiError =
    input instanceof ApiError
      ? input
      : new ApiError(input.code, input.message, input.status, { retryable: input.retryable, recoveryAction: input.recoveryAction, details: input.details });
  const requestId = options?.requestId ?? getCorrelationId() ?? createRequestId();
  const traceId = getActiveTraceId();
  const body = { ...toErrorShape(apiError, requestId), ...(traceId ? { traceId } : {}), ...(options?.legacy ?? {}) };

  return NextResponse.json(body, {
    status: apiError.status,
    headers: { "Cache-Control": "no-store", ...(traceId ? { "X-Trace-Id": traceId } : {}), ...(options?.headers ?? {}) },
  });
}
