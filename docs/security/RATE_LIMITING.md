# Inbound rate limiting

Golden Raccoon applies request-level rate limiting to every `/api/*` route through Next.js middleware and a shared limiter module. Limits protect paid provider quota, payment-gated scans, and state-changing execution routes from inbound abuse.

## Architecture

```
Client request
    │
    ▼
middleware.ts ──► resolveRoutePolicy(path, method)
    │                    │
    │                    ▼
    │              buildBucketKeyFromRequest()
    │              (HMAC hashed IP + wallet cookie + network)
    │                    │
    │                    ▼
    │              consumeRateLimitSync() / consumeRateLimit()
    │              memory store or Redis REST
    │                    │
    ├─ allowed ──► set x-golden-raccoon-rate-limit-checked
    │              + RateLimit-* headers
    │
    └─ denied ───► 429 + typed rate_limited error + Retry-After

Route handler
    │
    └─ checkRateLimit() skips when middleware header is present
```

## Bucket keys

Bucket keys never store raw identifiers:

- **Client IP** is hashed with `RATE_LIMIT_KEY_SECRET`.
- **Wallet session** uses an HMAC of the raw `gr_wallet_session` cookie value, not the decoded wallet address.
- **Network scope** comes from `network` / `chain` query params, `x-stellar-network`, or `NEXT_PUBLIC_STELLAR_NETWORK`, then hashed.

Observability records only `bucketFingerprint`, a second HMAC of the full bucket key.

## Stores

| Environment | Store | Configuration |
|-------------|-------|---------------|
| Local dev | In-memory | Default; single instance only |
| Production | Redis REST | `RATE_LIMIT_REDIS_REST_URL` + `RATE_LIMIT_REDIS_REST_TOKEN`, or Upstash `UPSTASH_REDIS_REST_*` |

When Redis is configured but unreachable, the limiter falls back to the in-memory store for that request.

## Health probes

These paths are never rate limited:

- `/api/health`
- `/api/portfolio/health`

## Route policies

Policies live in `frontend/src/server/security/rateLimit/policy.ts`. Expensive provider fan-out and payment-gated routes use tighter windows than cheap reads. Shared profiles (`tokenScan`, `executionPrepare`, `alertRead`, etc.) remain available for route handlers that call `checkRateLimitProfile`.

## Response contract

Rejected requests return:

- HTTP `429`
- JSON body with `code: "rate_limited"` via the shared `jsonError` helper
- Headers: `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`, `Retry-After`

## Environment variables

```env
RATE_LIMIT_ENABLED=1
RATE_LIMIT_KEY_SECRET=
RATE_LIMIT_REDIS_REST_URL=
RATE_LIMIT_REDIS_REST_TOKEN=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

## Verification

```bash
cd frontend
npm run test:rate-limit
```

## Out of scope

- CAPTCHA or proof-of-work
- Per-customer API keys or quota tiers
- CDN / edge WAF configuration
