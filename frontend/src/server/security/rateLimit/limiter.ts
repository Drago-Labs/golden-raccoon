import type { NextRequest } from "next/server";
import { jsonError } from "@/server/api/errors";
import { recordRateLimitDecision } from "@/server/observability/metrics";
import { rateLimitHeadersRecord } from "@/server/security/rateLimit/headers";
import { bucketKeyFingerprint, buildBucketKeyFromRequest } from "@/server/security/rateLimit/keys";
import type { RouteRateLimitPolicy } from "@/server/security/rateLimit/policy";
import { consumeRateLimit, consumeRateLimitSync, type RateLimitDecision } from "@/server/security/rateLimit/store";

export const RATE_LIMIT_CHECKED_HEADER = "x-golden-raccoon-rate-limit-checked";

export function isRateLimitDisabled() {
  return process.env.RATE_LIMIT_ENABLED === "0";
}

export function wasRateLimitCheckedByMiddleware(request: Request | NextRequest) {
  return request.headers.get(RATE_LIMIT_CHECKED_HEADER) === "1";
}

function recordDecision(policy: RouteRateLimitPolicy, decision: RateLimitDecision) {
  recordRateLimitDecision({
    namespace: policy.namespace,
    allowed: decision.allowed,
    bucketFingerprint: bucketKeyFingerprint(decision.bucketKey),
  });
}

export function buildRateLimitResponse(policy: RouteRateLimitPolicy, decision: RateLimitDecision) {
  return jsonError(
    {
      code: "rate_limited",
      message: `Too many ${policy.namespace} requests. Try again after ${new Date(decision.resetAt).toISOString()}.`,
      status: 429,
      retryable: true,
      recoveryAction: "retry",
    },
    {
      headers: rateLimitHeadersRecord(decision),
    },
  );
}

export function evaluateRateLimitSync(request: Request | NextRequest, policy: RouteRateLimitPolicy): RateLimitDecision {
  if (isRateLimitDisabled()) {
    const bucketKey = buildBucketKeyFromRequest(request, policy.namespace);
    return {
      allowed: true,
      limit: policy.limit,
      remaining: policy.limit,
      resetAt: Date.now() + policy.windowMs,
      retryAfterSeconds: 0,
      bucketKey,
    };
  }

  const bucketKey = buildBucketKeyFromRequest(request, policy.namespace);
  const decision = consumeRateLimitSync(bucketKey, policy.limit, policy.windowMs);
  recordDecision(policy, decision);
  return decision;
}

export async function evaluateRateLimit(
  request: Request | NextRequest,
  policy: RouteRateLimitPolicy,
): Promise<RateLimitDecision> {
  if (isRateLimitDisabled()) {
    const bucketKey = buildBucketKeyFromRequest(request, policy.namespace);
    return {
      allowed: true,
      limit: policy.limit,
      remaining: policy.limit,
      resetAt: Date.now() + policy.windowMs,
      retryAfterSeconds: 0,
      bucketKey,
    };
  }

  const bucketKey = buildBucketKeyFromRequest(request, policy.namespace);
  const decision = await consumeRateLimit(bucketKey, policy.limit, policy.windowMs);
  recordDecision(policy, decision);
  return decision;
}

export function markRateLimitChecked(request: Request | NextRequest) {
  const headers = new Headers(request.headers);
  headers.set(RATE_LIMIT_CHECKED_HEADER, "1");
  return headers;
}
