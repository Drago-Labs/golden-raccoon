# Alert Delivery System

Golden Raccoon delivers triggered and recovered alerts through pluggable delivery channels with jittered exponential retries, dead-letter queuing, and operator replay controls.

## Pluggable Channel Architecture

Channels implement the `AlertChannel` interface (`src/server/observability/channels/types.ts`):

```ts
export interface AlertChannel {
  readonly id: AlertDeliveryChannel;
  readonly name: string;
  health(): Promise<ChannelHealth>;
  shapePayload?(alert: Alert, evidence?: AlertObservation["evidence"]): AlertDelivery["sanitizedPayload"];
  send(payload: AlertDelivery["sanitizedPayload"], options: ChannelSendOptions): Promise<ChannelSendResult>;
}
```

New channels register dynamically via `registerChannel(channel)` without modifying `alertEngine.ts`:

```ts
import { registerChannel } from "@/server/observability/channels/registry";
registerChannel(new CustomChannel());
```

### Supported Channels

| Channel | Identifier | Mechanism | Configuration |
| --- | --- | --- | --- |
| In-App | `in_app` | Local persistence and feed | Always available |
| Email | `email` | Signed webhook | `ALERT_EMAIL_WEBHOOK_URL`, `ALERT_EMAIL_WEBHOOK_SECRET` |
| Telegram | `telegram` | Telegram Bot API `sendMessage` | `ALERT_TELEGRAM_BOT_TOKEN`, `ALERT_TELEGRAM_CHAT_ID` |
| Discord | `discord` | Discord Webhook with `wait=true` | `ALERT_DISCORD_WEBHOOK_URL` |
| Webhook | `webhook` | Generic HMAC-SHA256 signed POST | `ALERT_WEBHOOK_URL`, `ALERT_WEBHOOK_SECRET` |

## Webhook Signatures & Idempotency

All outgoing webhook payloads (`email` and `webhook`) include:

- `x-alert-timestamp`: ISO 8601 timestamp
- `x-alert-signature`: `sha256=<hex>` computed via `HMAC_SHA256(secret, timestamp + "." + body)`
- `x-idempotency-key`: Deterministic or random deduplication key

Signatures are verified using constant-time comparison (`crypto.timingSafeEqual`) to prevent timing attacks.

## Redaction & Sanitization Boundary

Sanitization occurs strictly prior to channel dispatch:
- Payloads pass through `buildSanitizedAlertPayload` to mask wallet addresses (`0x1234...abcd`).
- Error details pass through `sanitizeDeliveryErrorDetail` to strip secrets, bearer tokens, query parameters, webhooks, and private endpoints before persisting to storage or rendering in UI.
- No channel can receive data that the sanitizer strips.

## Retry Policy with Jitter

Deliveries employ exponential backoff with full jitter:

- Formula: `sleepMs = randomBetween(0, min(maxMs, baseMs * factor^attempt))`
- Default parameters: `baseMs = 500ms`, `factor = 2`, `maxMs = 10000ms`, `jitterRatio = 0.5`.
- Test override: `ALERT_DELIVERY_BACKOFF_MS=0` removes sleep latency in automated suites.
- Transient errors (`429`, `5xx`, timeouts, connection drops) are retried up to 3 times.
- Terminal errors (`400`, `401`, `403`, `404`, malformed payloads, user cancellation) abort immediately without retry.

## Dead-Letter Queue (DLQ)

When delivery attempts are exhausted or encounter a terminal failure:
1. The delivery record is marked `status: "failed"` with `terminal: true`.
2. The delivery is pushed to the in-memory dead-letter queue (`recordDeadLetter`).
3. The queue maintains a bounded capacity (default 100 entries per wallet) with FIFO eviction.
4. Each DLQ entry tracks the delivery ID, failure reason, timestamp, and full attempt history.

### DLQ & Replay API Routes

- `GET /api/alerts/deliveries/dead-letter`: List dead-lettered deliveries and current queue depth.
- `POST /api/alerts/deliveries/dead-letter`: Replay all dead-lettered deliveries for the authenticated wallet.
- `POST /api/alerts/deliveries/[id]/replay`: Replay an individual failed delivery.

Replays:
- Enforce idempotency: replaying an already-delivered alert returns `409 Conflict`.
- Append attempt records with `isReplay: true`.
- Automatically evict successful deliveries from the dead-letter queue.
- Increment `replayCount` and update `lastReplayedAt`.

## Operator Dashboard UI

The alerts console (`/alerts`) includes:
- **Dead-Letter Panel (`DeadLetterPanel.tsx`)**: Displays dead-letter queue depth, failed channel indicators, failure reasons, individual replay buttons, and bulk "Replay All" functionality.
- **Delivery Attempt Timeline (`AlertHistoryList.tsx`)**: Expandable attempt breakdown for each delivery row showing status, duration, failure code, and replay badges.

## Verification & Testing

```bash
cd frontend
npm run test:alert-delivery   # 17 unit/integration test fixtures covering channels, backoff, DLQ, and replay
npm run test:alerts           # Core alert engine integration and lifecycle checks
npm run build                 # Clean production compilation across all 81 Next.js routes
```
