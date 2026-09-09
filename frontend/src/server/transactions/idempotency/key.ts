import { ApiError } from "@/server/api/errors";

const IDEMPOTENCY_KEY_REGEX = /^[A-Za-z0-9_\-:.]{1,160}$/;

/**
 * Normalizes an idempotency key string by trimming whitespace.
 */
export function normalizeIdempotencyKey(key?: unknown): string {
  if (typeof key !== "string") return "";
  return key.trim();
}

/**
 * Validates the syntax of an idempotency key.
 * Allows alphanumeric, hyphen, underscore, colon, and period up to 160 characters.
 */
export function isValidIdempotencyKey(key: string): boolean {
  if (!key || typeof key !== "string") return false;
  return IDEMPOTENCY_KEY_REGEX.test(key);
}

/**
 * Asserts that an idempotency key is non-empty and well-formed.
 * Throws ApiError with code "idempotency_key_required" or "validation_error".
 */
export function assertValidIdempotencyKey(key?: unknown): string {
  const normalized = normalizeIdempotencyKey(key);
  if (!normalized) {
    throw new ApiError(
      "idempotency_key_required",
      "An idempotency key is strictly required for this execution route.",
      400,
      { retryable: false, recoveryAction: "stop" },
    );
  }
  if (!isValidIdempotencyKey(normalized)) {
    throw new ApiError(
      "validation_error",
      `Invalid idempotency key format. Must match ${IDEMPOTENCY_KEY_REGEX.toString()} (up to 160 characters).`,
      400,
      { retryable: false, recoveryAction: "stop" },
    );
  }
  return normalized;
}

/**
 * Extracts an idempotency key from HTTP headers (Idempotency-Key or x-idempotency-key)
 * or JSON request body (idempotencyKey).
 */
export function extractIdempotencyKey(
  requestOrHeaders?: Request | Headers | null,
  body?: Record<string, unknown> | null,
): string | undefined {
  let headerKey: string | null = null;

  if (requestOrHeaders) {
    if (typeof (requestOrHeaders as Request).headers?.get === "function") {
      headerKey =
        (requestOrHeaders as Request).headers.get("idempotency-key") ??
        (requestOrHeaders as Request).headers.get("x-idempotency-key");
    } else if (typeof (requestOrHeaders as Headers).get === "function") {
      headerKey =
        (requestOrHeaders as Headers).get("idempotency-key") ??
        (requestOrHeaders as Headers).get("x-idempotency-key");
    }
  }

  const normalizedHeaderKey = normalizeIdempotencyKey(headerKey);
  if (normalizedHeaderKey) return normalizedHeaderKey;

  if (body && typeof body === "object" && body.idempotencyKey) {
    const normalizedBodyKey = normalizeIdempotencyKey(body.idempotencyKey);
    if (normalizedBodyKey) return normalizedBodyKey;
  }

  return undefined;
}

/**
 * Builds a deterministic composite idempotency key when none is supplied by the client
 * for non-strict routes like prepare.
 */
export function buildCompositeIdempotencyKey(params: {
  walletAddress: string;
  network: string;
  action?: string;
  asset?: string;
  decisionId?: string;
  providedKey?: string;
}): string {
  if (params.providedKey) {
    const normalized = normalizeIdempotencyKey(params.providedKey);
    if (isValidIdempotencyKey(normalized)) return normalized;
  }

  const parts = [
    params.walletAddress.trim().toLowerCase(),
    params.network.trim().toLowerCase(),
    params.action ?? "swap",
    params.asset ?? "default",
    params.decisionId ?? "auto",
  ];

  return parts.join(":").slice(0, 160);
}
