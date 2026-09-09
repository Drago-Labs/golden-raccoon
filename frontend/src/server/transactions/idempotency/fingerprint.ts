import { createHash } from "node:crypto";

/**
 * Recursively canonicalizes an arbitrary JavaScript object or value into a deterministic structure.
 * - Object keys are sorted alphabetically.
 * - Volatile fields (e.g. idempotencyKey, requestId, traceId, random nonces) can be omitted.
 * - Numbers, booleans, strings, and nulls are preserved.
 * - Undefined and function properties are omitted.
 */
export function canonicalizeValue(value: unknown, ignoredKeys: Set<string> = DEFAULT_IGNORED_KEYS): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => canonicalizeValue(item, ignoredKeys));
  }

  const sortedObj: Record<string, unknown> = {};
  const keys = Object.keys(value as Record<string, unknown>).sort();

  for (const key of keys) {
    if (ignoredKeys.has(key)) continue;
    const propVal = (value as Record<string, unknown>)[key];
    if (propVal === undefined || typeof propVal === "function") continue;
    sortedObj[key] = canonicalizeValue(propVal, ignoredKeys);
  }

  return sortedObj;
}

const DEFAULT_IGNORED_KEYS = new Set([
  "idempotencyKey",
  "idempotency_key",
  "requestId",
  "traceId",
  "correlationId",
  "timestamp",
  "fetchedAt",
]);

/**
 * Deterministically serializes an arbitrary payload to a stable JSON string.
 */
export function canonicalJsonStringify(value: unknown, ignoredKeys: Set<string> = DEFAULT_IGNORED_KEYS): string {
  const canonical = canonicalizeValue(value, ignoredKeys);
  return JSON.stringify(canonical);
}

/**
 * Computes a deterministic SHA-256 payload fingerprint.
 * Any semantic alteration to payload fields produces a distinct fingerprint.
 */
export function computePayloadFingerprint(
  payload: unknown,
  ignoredKeys: Set<string> = DEFAULT_IGNORED_KEYS,
): string {
  const canonicalJson = canonicalJsonStringify(payload, ignoredKeys);
  return createHash("sha256").update(canonicalJson).digest("hex");
}
