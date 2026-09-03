import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import {
  buildRateLimitResponse,
  evaluateRateLimitSync,
  RATE_LIMIT_CHECKED_HEADER,
} from "@/server/security/rateLimit/limiter";
import {
  buildBucketKeyFromRequest,
  bucketKeyFingerprint,
  getClientIp,
} from "@/server/security/rateLimit/keys";
import {
  HEALTH_PROBE_PATHS,
  rateLimitProfiles,
  resolveRoutePolicy,
} from "@/server/security/rateLimit/policy";
import { resetAllRateLimitBuckets } from "@/server/security/rateLimit/store";
import { checkRateLimit } from "@/server/security/rateLimit";
import { getRateLimitHealth } from "@/server/env/validation";
import { getRateLimitMetrics, resetRateLimitMetricsForTests } from "@/server/observability/metrics";

function request(url: string, init?: RequestInit) {
  return new NextRequest(new URL(url, "http://localhost:3000"), init);
}

async function main() {
  resetAllRateLimitBuckets();
  resetRateLimitMetricsForTests();

  const healthPolicy = resolveRoutePolicy("/api/health", "GET");
  assert.equal(healthPolicy, null, "Health probes must not resolve to a rate-limit policy.");
  assert(HEALTH_PROBE_PATHS.includes("/api/health"));
  assert(HEALTH_PROBE_PATHS.includes("/api/portfolio/health"));

  const tokenPolicy = resolveRoutePolicy("/api/scan/token", "POST");
  assert(tokenPolicy);
  assert.equal(tokenPolicy.namespace, rateLimitProfiles.tokenScan.namespace);
  assert.equal(tokenPolicy.limit, 25);

  const deepScanPolicy = resolveRoutePolicy("/api/x402/deep-scan", "POST");
  assert(deepScanPolicy);
  assert.equal(deepScanPolicy.limit, 10, "Payment-gated deep scan must stay tightly limited.");

  const cheapReadPolicy = resolveRoutePolicy("/api/history/transactions", "GET");
  assert(cheapReadPolicy);
  assert(
    cheapReadPolicy.limit > deepScanPolicy.limit,
    "Cheap reads must allow more requests than payment-gated routes.",
  );

  const rawIp = "203.0.113.44";
  const walletCookie = "gr_wallet_session=v2:0xabc123:deadbeef";
  const probe = request("http://localhost:3000/api/scan/token?network=base", {
    headers: {
      "x-forwarded-for": rawIp,
      cookie: walletCookie,
    },
  });

  const bucketKey = buildBucketKeyFromRequest(probe, "scan:token");
  assert(!bucketKey.includes(rawIp), "Bucket key must not contain raw client IP.");
  assert(!bucketKey.includes("0xabc123"), "Bucket key must not contain raw wallet address.");
  assert.equal(getClientIp(probe), rawIp, "Helper may read IP internally but keys stay hashed.");

  const fingerprint = bucketKeyFingerprint(bucketKey);
  assert.equal(fingerprint.length, 16);
  assert(!fingerprint.includes(rawIp));

  for (let index = 0; index < tokenPolicy.limit; index += 1) {
    const decision = evaluateRateLimitSync(probe, tokenPolicy);
    assert(decision.allowed, `Request ${index + 1} should be allowed.`);
  }

  const blocked = evaluateRateLimitSync(probe, tokenPolicy);
  assert.equal(blocked.allowed, false, "Exceeding the policy must deny the next request.");
  assert(blocked.retryAfterSeconds >= 1);

  const limitedResponse = buildRateLimitResponse(tokenPolicy, blocked);
  assert.equal(limitedResponse.status, 429);
  assert.equal(limitedResponse.headers.get("RateLimit-Limit"), String(tokenPolicy.limit));
  assert.equal(limitedResponse.headers.get("RateLimit-Remaining"), "0");
  assert(limitedResponse.headers.get("RateLimit-Reset"));
  assert(limitedResponse.headers.get("Retry-After"));

  const limitedBody = (await limitedResponse.json()) as { code: string };
  assert.equal(limitedBody.code, "rate_limited");

  resetAllRateLimitBuckets();
  resetRateLimitMetricsForTests();

  const paymentProbe = request("http://localhost:3000/api/x402/deep-scan", {
    headers: { "x-forwarded-for": "198.51.100.10" },
  });

  for (let index = 0; index < deepScanPolicy.limit; index += 1) {
    const decision = evaluateRateLimitSync(paymentProbe, deepScanPolicy);
    assert(decision.allowed, `Payment-gated request ${index + 1} should be allowed.`);
  }

  const paymentBlocked = evaluateRateLimitSync(paymentProbe, deepScanPolicy);
  assert.equal(paymentBlocked.allowed, false, "Payment-gated route must block once policy is exhausted.");

  resetAllRateLimitBuckets();

  const middlewareChecked = request("http://localhost:3000/api/scan/token", {
    headers: {
      [RATE_LIMIT_CHECKED_HEADER]: "1",
      "x-forwarded-for": rawIp,
    },
  });

  for (let index = 0; index < tokenPolicy.limit + 5; index += 1) {
    const skipped = checkRateLimit(middlewareChecked, tokenPolicy);
    assert.equal(skipped, null, "Route handler must skip when middleware already checked the limit.");
  }

  evaluateRateLimitSync(probe, tokenPolicy);
  const metrics = getRateLimitMetrics();
  assert(metrics.allowed + metrics.denied > 0, "Rate-limit decisions must be recorded.");
  assert(metrics.byNamespace["scan:token"], "Namespace counters must be tracked.");

  const health = getRateLimitHealth();
  assert.equal(typeof health.enabled, "boolean");
  assert.equal(typeof health.store, "string");

  console.log("Rate limit verification passed.");
  console.log(`  store: ${health.store}`);
  console.log(`  metrics: allowed=${metrics.allowed} denied=${metrics.denied}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
