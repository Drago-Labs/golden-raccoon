import type { RateLimitDecision } from "@/server/security/rateLimit/store";

export function rateLimitHeadersRecord(decision: RateLimitDecision): Record<string, string> {
  const headers: Record<string, string> = {
    "RateLimit-Limit": String(decision.limit),
    "RateLimit-Remaining": String(decision.remaining),
    "RateLimit-Reset": String(Math.max(0, Math.ceil(decision.resetAt / 1000))),
  };
  if (!decision.allowed) {
    headers["Retry-After"] = String(decision.retryAfterSeconds);
  }
  return headers;
}

export function applyRateLimitHeaders(response: Response, decision: RateLimitDecision) {
  for (const [key, value] of Object.entries(rateLimitHeadersRecord(decision))) {
    response.headers.set(key, value);
  }
  return response;
}
