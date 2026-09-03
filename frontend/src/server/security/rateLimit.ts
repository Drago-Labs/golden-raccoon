import type { NextRequest } from "next/server";
import {
  buildRateLimitResponse,
  evaluateRateLimitSync,
  wasRateLimitCheckedByMiddleware,
} from "@/server/security/rateLimit/limiter";
import { buildBucketKeyFromRequest } from "@/server/security/rateLimit/keys";
import { rateLimitProfiles, type RateLimitProfile } from "@/server/security/rateLimit/policy";

export { rateLimitProfiles };
export type { RateLimitProfile };
export {
  HEALTH_PROBE_PATHS,
  resolveRoutePolicy,
} from "@/server/security/rateLimit/policy";
export {
  RATE_LIMIT_CHECKED_HEADER,
  evaluateRateLimit,
  evaluateRateLimitSync,
  buildRateLimitResponse,
} from "@/server/security/rateLimit/limiter";
export { bucketKeyFingerprint, buildBucketKeyFromRequest, fingerprint, getClientIp } from "@/server/security/rateLimit/keys";
export { consumeRateLimit, consumeRateLimitSync, resetAllRateLimitBuckets, resetRateLimitBucket } from "@/server/security/rateLimit/store";

type RateLimitOptions = RateLimitProfile;

export function getClientKey(request: Request | NextRequest, namespace: string) {
  return buildBucketKeyFromRequest(request, namespace);
}

export function checkRateLimit(request: Request | NextRequest, options: RateLimitOptions) {
  if (wasRateLimitCheckedByMiddleware(request)) {
    return null;
  }

  const decision = evaluateRateLimitSync(request, options);

  if (!decision.allowed) {
    return buildRateLimitResponse(options, decision);
  }

  return null;
}

export function checkRateLimitProfile(request: Request | NextRequest, profile: keyof typeof rateLimitProfiles) {
  return checkRateLimit(request, rateLimitProfiles[profile]);
}
