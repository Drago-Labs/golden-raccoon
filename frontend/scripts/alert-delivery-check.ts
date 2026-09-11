/**
 * Alert delivery adapter fixture check.
 *
 *   cd frontend && npm run test:alert-delivery
 *
 * Uses deterministic fake transports only — never calls live email, Telegram,
 * or Discord services. Covers timeout, 429, 5xx, malformed success, permanent
 * 4xx, cancellation, duplicate idempotency, bounded retry, and HMAC verify.
 */

import {
  createAlert,
  createAlertDelivery,
  createAlertObservation,
  listAlertDeliveries,
  updateAlertDelivery,
  upsertAlertRule,
} from "../src/server/storage";
import {
  buildDeliveryIdempotencyKey,
  deliverAlertToChannel,
  findDeliveryByIdempotencyKey,
  persistDeliveryResult,
  retryAlertDelivery,
  replayAlertDelivery,
  replayDeadLetterQueue,
} from "../src/server/observability/alertDeliveries";
import {
  registerChannel,
  unregisterChannel,
  getChannel,
  listChannels,
} from "../src/server/observability/channels";
import { verifyWebhookSignature } from "../src/server/observability/channels/webhook";
import { calculateBackoff } from "../src/server/observability/delivery/retry";
import {
  recordDeadLetter,
  getDeadLetterDepth,
  listDeadLetters,
  clearDeadLetters,
} from "../src/server/observability/delivery/deadLetter";
import {
  HttpTransportError,
  resetAlertDeliveryTransport,
  setAlertDeliveryTransport,
  type AlertHttpTransport,
  type HttpRequest,
  type HttpResponse,
} from "../src/server/observability/delivery/http";
import {
  signEmailWebhookPayload,
  verifyEmailWebhookSignature,
} from "../src/server/observability/delivery/email";
import { buildSanitizedAlertPayload, sanitizeDeliveryErrorDetail } from "../src/server/observability/alertSanitize";
import { fanOutDeliveries } from "../src/server/observability/alertEngine";
import type { Alert, AlertDelivery } from "../src/server/types";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const WALLET = "0xdeliveryfixturewallet000000000000000001";

function samplePayload(): AlertDelivery["sanitizedPayload"] {
  return {
    triggerType: "critical_risk",
    severity: "high",
    summary: "Critical risk reached 90 (onchain:fixture).",
    beforeValue: 40,
    afterValue: 90,
    observationKey: "onchain:fixture",
    evidenceLinks: ["agent-run:run_fixture"],
    walletHint: "wallet:…0001",
  };
}

function makeAlert(): Alert {
  const rule = upsertAlertRule({
    id: `rule_delivery_${Math.random().toString(36).slice(2, 8)}`,
    walletAddress: WALLET,
    triggerType: "critical_risk",
    threshold: 75,
    hysteresis: 5,
    cooldownMinutes: 0,
    direction: "high_is_bad",
    severity: "high",
    enabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  return createAlert({
    walletAddress: WALLET,
    ruleId: rule.id,
    triggerType: "critical_risk",
    observationKey: "onchain:fixture",
    status: "triggered",
    severity: "high",
    message: "Critical risk reached 90 (onchain:fixture).",
    beforeValue: 40,
    afterValue: 90,
    evidenceBefore: {
      runId: "run_before",
      agent: "onchain",
      label: "before",
      detail: "prior",
      sourceLabels: ["GoPlus"],
    },
    evidenceAfter: {
      runId: "run_after",
      agent: "onchain",
      label: "after",
      detail: "now",
      sourceLabels: ["GoPlus"],
    },
    evidenceData: {
      runId: "run_after",
      observationId: "obs_after",
      evidenceAfterObservationId: "obs_after",
      sourceSnapshotHashAfter: "snap_after",
      evidenceAfterHash: "evh_after",
      deteriorationObservationIds: ["obs_after"],
    },
  });
}

function jsonResponse(status: number, body: unknown): HttpResponse {
  return {
    status,
    headers: { "content-type": "application/json" },
    bodyText: JSON.stringify(body),
  };
}

function installScriptedTransport(handler: AlertHttpTransport): void {
  setAlertDeliveryTransport(handler);
}

function withEnv(vars: Record<string, string | undefined>, run: () => Promise<void>): Promise<void> {
  const previous: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(vars)) {
    previous[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  return run().finally(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    resetAlertDeliveryTransport();
  });
}

async function testEmailHmacAndSuccess() {
  await withEnv(
    {
      ALERT_EMAIL_WEBHOOK_URL: "https://hooks.example.test/email",
      ALERT_EMAIL_WEBHOOK_SECRET: "fixture-secret",
      ALERT_DELIVERY_BACKOFF_MS: "0",
    },
    async () => {
      let seen: HttpRequest | undefined;
      installScriptedTransport(async (request) => {
        seen = request;
        return jsonResponse(200, { ok: true, id: "email_msg_1" });
      });

      const alert = makeAlert();
      const result = await deliverAlertToChannel("email", samplePayload(), alert, {
        idempotencyKey: "idem_email_ok",
        withRetry: false,
      });

      assert(result.status === "delivered", "Email adapter must deliver on validated 2xx.");
      assert(result.providerMessageId === "email_msg_1", "Email adapter must capture provider message id.");
      assert(seen?.headers?.["x-alert-signature"]?.startsWith("sha256="), "Email adapter must send HMAC signature.");
      const timestamp = seen?.headers?.["x-alert-timestamp"] ?? "";
      const signature = (seen?.headers?.["x-alert-signature"] ?? "").replace(/^sha256=/, "");
      assert(
        verifyEmailWebhookSignature("fixture-secret", timestamp, seen?.body ?? "", signature),
        "Email webhook signature must be verifiable.",
      );
      assert(
        signEmailWebhookPayload("fixture-secret", timestamp, seen?.body ?? "") === signature,
        "signEmailWebhookPayload must match the outbound signature.",
      );
    },
  );
}

async function testTelegramValidation() {
  await withEnv(
    {
      ALERT_TELEGRAM_BOT_TOKEN: "123456:FAKE_TELEGRAM_TOKEN_FOR_FIXTURE_ONLY",
      ALERT_TELEGRAM_CHAT_ID: "999001",
      ALERT_DELIVERY_BACKOFF_MS: "0",
    },
    async () => {
      installScriptedTransport(async () => jsonResponse(200, { ok: true, result: { message_id: 42 } }));
      const alert = makeAlert();
      const ok = await deliverAlertToChannel("telegram", samplePayload(), alert, {
        idempotencyKey: "idem_tg_ok",
        withRetry: false,
      });
      assert(ok.status === "delivered" && ok.providerMessageId === "42", "Telegram must require ok+message_id.");

      installScriptedTransport(async () => jsonResponse(200, { ok: false, description: "Bad Request" }));
      const malformed = await deliverAlertToChannel("telegram", samplePayload(), alert, {
        idempotencyKey: "idem_tg_malformed",
        withRetry: false,
      });
      assert(malformed.status === "failed" && malformed.terminal, "Malformed Telegram success must be terminal failed.");
    },
  );
}

async function testDiscordValidation() {
  await withEnv(
    {
      ALERT_DISCORD_WEBHOOK_URL: "https://discord.example.test/api/webhooks/1/token",
      ALERT_DELIVERY_BACKOFF_MS: "0",
    },
    async () => {
      installScriptedTransport(async () => ({ status: 204, headers: {}, bodyText: "" }));
      const alert = makeAlert();
      const ok = await deliverAlertToChannel("discord", samplePayload(), alert, {
        idempotencyKey: "idem_discord_ok",
        withRetry: false,
      });
      assert(ok.status === "delivered", "Discord 204 must count as delivered.");

      installScriptedTransport(async () => jsonResponse(200, { id: null }));
      const malformed = await deliverAlertToChannel("discord", samplePayload(), alert, {
        idempotencyKey: "idem_discord_malformed",
        withRetry: false,
      });
      assert(malformed.status === "failed" && malformed.terminal, "Malformed Discord body must be terminal failed.");
    },
  );
}

async function testRetryableAndTerminalFailures() {
  await withEnv(
    {
      ALERT_DISCORD_WEBHOOK_URL: "https://discord.example.test/api/webhooks/1/token",
      ALERT_DELIVERY_BACKOFF_MS: "0",
    },
    async () => {
      const alert = makeAlert();
      let calls = 0;

      installScriptedTransport(async () => {
        calls += 1;
        return { status: 429, headers: {}, bodyText: "rate limited" };
      });
      const rateLimited = await deliverAlertToChannel("discord", samplePayload(), alert, {
        idempotencyKey: "idem_429",
        withRetry: true,
      });
      assert(rateLimited.status === "failed", "429 must eventually fail after bounded retries.");
      assert(rateLimited.terminal === true, "Exhausted 429 retries must be terminal.");
      assert(calls === 3, "429 must retry up to max attempts.");

      calls = 0;
      installScriptedTransport(async () => {
        calls += 1;
        return { status: 503, headers: {}, bodyText: "unavailable" };
      });
      const serverError = await deliverAlertToChannel("discord", samplePayload(), alert, {
        idempotencyKey: "idem_503",
        withRetry: true,
      });
      assert(serverError.status === "failed" && calls === 3, "5xx must retry up to max attempts.");

      calls = 0;
      installScriptedTransport(async () => {
        calls += 1;
        return { status: 400, headers: {}, bodyText: "bad request" };
      });
      const permanent = await deliverAlertToChannel("discord", samplePayload(), alert, {
        idempotencyKey: "idem_400",
        withRetry: true,
      });
      assert(permanent.status === "failed" && permanent.terminal === true, "Permanent 4xx must be terminal.");
      assert(calls === 1, "Permanent 4xx must never retry.");
    },
  );
}

async function testTimeoutAndCancellation() {
  await withEnv(
    {
      ALERT_EMAIL_WEBHOOK_URL: "https://hooks.example.test/email",
      ALERT_EMAIL_WEBHOOK_SECRET: "fixture-secret",
      ALERT_DELIVERY_BACKOFF_MS: "0",
    },
    async () => {
      const alert = makeAlert();

      installScriptedTransport(async () => {
        throw new HttpTransportError("timeout", "Delivery request timed out.", {
          retryable: true,
          terminal: false,
        });
      });
      const timedOut = await deliverAlertToChannel("email", samplePayload(), alert, {
        idempotencyKey: "idem_timeout",
        withRetry: true,
      });
      assert(timedOut.status === "failed" && timedOut.attemptCount === 3, "Timeouts must retry then fail.");

      const controller = new AbortController();
      controller.abort();
      installScriptedTransport(async () => jsonResponse(200, { ok: true, id: "should_not_send" }));
      const cancelled = await deliverAlertToChannel("email", samplePayload(), alert, {
        idempotencyKey: "idem_cancel",
        signal: controller.signal,
        withRetry: true,
      });
      assert(cancelled.status === "failed" && cancelled.terminal, "Cancellation must be terminal failed.");
    },
  );
}

async function testDuplicateIdempotency() {
  await withEnv(
    {
      ALERT_DISCORD_WEBHOOK_URL: "https://discord.example.test/api/webhooks/1/token",
      ALERT_DELIVERY_BACKOFF_MS: "0",
    },
    async () => {
      let calls = 0;
      installScriptedTransport(async () => {
        calls += 1;
        return jsonResponse(200, { id: "discord_1" });
      });

      const alert = makeAlert();
      const observation = createAlertObservation({
        walletAddress: WALLET,
        triggerType: "critical_risk",
        observationKey: "onchain:fixture",
        value: 90,
        direction: "high_is_bad",
        evidence: {
          runId: "run_dup",
          agent: "onchain",
          label: "dup",
          detail: "dup",
          sourceLabels: ["GoPlus"],
        },
      });

      const first = await fanOutDeliveries(alert, observation, "trigger");
      const second = await fanOutDeliveries(alert, observation, "trigger");
      const discordFirst = first.find((row) => row.channel === "discord");
      const discordSecond = second.find((row) => row.channel === "discord");

      assert(discordFirst?.status === "delivered", "First discord fan-out must deliver.");
      assert(discordSecond?.id === discordFirst?.id, "Duplicate fan-out must reuse the same delivery row.");
      assert(calls === 1, "Duplicate idempotency key must not call the provider twice.");

      const key = buildDeliveryIdempotencyKey(alert.id, "discord", "trigger");
      assert(findDeliveryByIdempotencyKey(alert.id, WALLET, key)?.id === discordFirst?.id, "Idempotency lookup must find the row.");
    },
  );
}

async function testRetryPathAndRedaction() {
  await withEnv(
    {
      ALERT_DISCORD_WEBHOOK_URL: "https://discord.example.test/api/webhooks/1/token",
      ALERT_DELIVERY_BACKOFF_MS: "0",
    },
    async () => {
      const alert = makeAlert();
      const payload = samplePayload();
      const created = createAlertDelivery({
        alertId: alert.id,
        walletAddress: WALLET,
        channel: "discord",
        status: "failed",
        sanitizedPayload: payload,
        attemptCount: 1,
        idempotencyKey: "idem_retry_row",
        terminal: false,
        errorDetail: sanitizeDeliveryErrorDetail("failed talking to https://secret.example/hook and chat_id=999"),
      });

      assert(
        !created.errorDetail?.includes("https://") && !created.errorDetail?.includes("chat_id=999"),
        "Stored errorDetail must redact URLs and chat ids.",
      );

      installScriptedTransport(async () => jsonResponse(200, { id: "discord_retry" }));
      const retried = await retryAlertDelivery(created.id, WALLET);
      assert(retried.ok, "Non-terminal failed delivery must be retryable.");
      if (retried.ok) {
        assert(retried.delivery.status === "delivered", "Retry success must mark delivered.");
        assert(retried.delivery.providerMessageId === "discord_retry", "Retry must persist provider message id.");
      }

      const terminal = createAlertDelivery({
        alertId: alert.id,
        walletAddress: WALLET,
        channel: "discord",
        status: "failed",
        sanitizedPayload: payload,
        attemptCount: 1,
        idempotencyKey: "idem_terminal_row",
        terminal: true,
        errorDetail: "Provider rejected the delivery (400).",
      });
      const blocked = await retryAlertDelivery(terminal.id, WALLET);
      assert(!blocked.ok && blocked.status === 409, "Terminal failures must not be retried.");
    },
  );
}

async function testForceFailAndInApp() {
  await withEnv(
    {
      ALERT_FORCE_FAIL_CHANNELS: "email",
      ALERT_EMAIL_WEBHOOK_URL: "https://hooks.example.test/email",
      ALERT_EMAIL_WEBHOOK_SECRET: "fixture-secret",
    },
    async () => {
      const alert = makeAlert();
      const forced = await deliverAlertToChannel("email", samplePayload(), alert);
      assert(forced.status === "failed" && forced.errorDetail?.includes("ALERT_FORCE_FAIL_CHANNELS"), "Force-fail hook must remain intact.");

      const inApp = await deliverAlertToChannel("in_app", samplePayload(), alert);
      assert(inApp.status === "delivered", "in_app must always deliver.");
    },
  );
}

async function testSkippedWithoutConfig() {
  await withEnv(
    {
      ALERT_EMAIL_WEBHOOK_URL: undefined,
      ALERT_EMAIL_WEBHOOK_SECRET: undefined,
      ALERT_TELEGRAM_BOT_TOKEN: undefined,
      ALERT_TELEGRAM_CHAT_ID: undefined,
      ALERT_DISCORD_WEBHOOK_URL: undefined,
      ALERT_FORCE_FAIL_CHANNELS: undefined,
    },
    async () => {
      const alert = makeAlert();
      const email = await deliverAlertToChannel("email", samplePayload(), alert, { withRetry: false });
      const telegram = await deliverAlertToChannel("telegram", samplePayload(), alert, { withRetry: false });
      const discord = await deliverAlertToChannel("discord", samplePayload(), alert, { withRetry: false });
      assert(email.status === "skipped", "Email without env must skip.");
      assert(telegram.status === "skipped", "Telegram without env must skip.");
      assert(discord.status === "skipped", "Discord without env must skip.");
    },
  );
}

async function testPersistAndSanitizePayload() {
  const alert = makeAlert();
  const sanitized = buildSanitizedAlertPayload(alert, alert.evidenceAfter, { walletAddressHint: WALLET });
  assert(!JSON.stringify(sanitized).includes(WALLET.toLowerCase()), "Sanitized payload must not include full wallet.");
  const result = await deliverAlertToChannel("in_app", sanitized, alert);
  const row = persistDeliveryResult(alert, "in_app", sanitized, result, "idem_persist_in_app");
  assert(row.status === "delivered", "Persisted in_app row must be delivered.");
  assert(listAlertDeliveries(alert.id, WALLET).some((entry) => entry.id === row.id), "Persisted row must be listable.");
  updateAlertDelivery(row.id, WALLET, { attemptCount: row.attemptCount });
}

async function testPluggableChannelRegistrationZeroEngineEdits() {
  const customChannelName = "custom_pager" as any;
  let customSent = false;
  let receivedPayload: unknown = null;

  registerChannel({
    id: customChannelName,
    name: "Custom Pager",
    shapePayload: (raw) => ({ ...samplePayload(), formattedForPager: true }),
    send: async (payload) => {
      customSent = true;
      receivedPayload = payload;
      return { status: "delivered", providerMessageId: "pager_msg_123" };
    },
    health: async () => ({ status: "healthy" }),
  });

  assert(listChannels().some((c) => c.id === customChannelName), "Custom channel must be listed in registry.");
  const customChannel = getChannel(customChannelName);
  assert(customChannel !== undefined, "Custom channel must be retrievable.");

  const alert = makeAlert();
  const shaped = customChannel.shapePayload(alert);
  assert((shaped as any)?.formattedForPager === true, "shapePayload must format alert payload.");

  const res = await deliverAlertToChannel(customChannelName, shaped, alert, { withRetry: false });
  assert(res.status === "delivered", "Custom channel delivery must succeed.");
  assert(customSent, "Custom send handler must be executed.");
  assert((receivedPayload as any)?.formattedForPager === true, "Custom send handler must receive shaped payload.");

  unregisterChannel(customChannelName);
  assert(getChannel(customChannelName) === undefined, "Unregistered channel must not be present in registry.");
}

async function testConcurrentFanoutIsolation() {
  const fastChannel = "fast_ch" as any;
  const slowChannel = "slow_ch" as any;
  let fastFinishedAt = 0;
  let slowFinishedAt = 0;

  registerChannel({
    id: fastChannel,
    name: "Fast Channel",
    shapePayload: (raw) => raw,
    send: async () => {
      fastFinishedAt = Date.now();
      return { status: "delivered" };
    },
  });

  registerChannel({
    id: slowChannel,
    name: "Slow Channel",
    shapePayload: (raw) => raw,
    send: async () => {
      await new Promise((resolve) => setTimeout(resolve, 60));
      slowFinishedAt = Date.now();
      return { status: "failed", errorDetail: "slow failure", terminal: true };
    },
  });

  const alert = makeAlert();
  const [fastRes, slowRes] = await Promise.all([
    deliverAlertToChannel(fastChannel, samplePayload(), alert, { withRetry: false }),
    deliverAlertToChannel(slowChannel, samplePayload(), alert, { withRetry: false }),
  ]);

  assert(fastRes.status === "delivered", "Fast channel must deliver successfully.");
  assert(slowRes.status === "failed", "Slow channel failure must be recorded.");
  assert(fastFinishedAt > 0 && slowFinishedAt > 0, "Both channels must complete.");
  assert(fastFinishedAt <= slowFinishedAt, "Fast channel must not wait on slow channel.");

  unregisterChannel(fastChannel);
  unregisterChannel(slowChannel);
}

async function testExponentialBackoffWithJitter() {
  await withEnv({ ALERT_DELIVERY_BACKOFF_MS: undefined }, async () => {
    const baseMs = 50;
    const b1 = calculateBackoff(1, { baseMs, jitterRatio: 0.25 });
    const b2 = calculateBackoff(2, { baseMs, jitterRatio: 0.25 });
    const b3 = calculateBackoff(3, { baseMs, jitterRatio: 0.25 });

    assert(b1 >= 50 && b1 <= 50 * 1.25, `b1 ${b1} must be within [50, 62.5]`);
    assert(b2 >= 100 && b2 <= 100 * 1.25, `b2 ${b2} must be within [100, 125]`);
    assert(b3 >= 200 && b3 <= 200 * 1.25, `b3 ${b3} must be within [200, 250]`);
  });
}

async function testDeadLetterQueueAndIndividualReplay() {
  clearDeadLetters();
  const alert = makeAlert();
  const delivery = createAlertDelivery({
    alertId: alert.id,
    walletAddress: WALLET,
    channel: "discord",
    status: "failed",
    attemptCount: 3,
    terminal: true,
    errorDetail: "webhook rejected after retries",
    sanitizedPayload: samplePayload(),
    idempotencyKey: "idem_dlq_test_1",
    attempts: [
      { attemptNumber: 1, timestamp: new Date().toISOString(), status: "failed", errorDetail: "conn err" },
      { attemptNumber: 2, timestamp: new Date().toISOString(), status: "failed", errorDetail: "conn err" },
      { attemptNumber: 3, timestamp: new Date().toISOString(), status: "failed", errorDetail: "conn err" },
    ],
  });

  recordDeadLetter(
    delivery,
    "Exhausted 3 retry attempts: webhook rejected after retries",
    delivery.attempts,
  );

  assert(getDeadLetterDepth(WALLET) === 1, "DLQ depth must be 1.");
  const entries = listDeadLetters(WALLET);
  assert(entries.length === 1 && entries[0].deliveryId === delivery.id, "DLQ must list recorded entry.");

  await withEnv(
    {
      ALERT_DISCORD_WEBHOOK_URL: "https://discord.example.test/api/webhooks/1/token",
      ALERT_DELIVERY_BACKOFF_MS: "0",
    },
    async () => {
      installScriptedTransport(async () => ({ status: 204, headers: {}, bodyText: "" }));

      const replayResult = await replayAlertDelivery(delivery.id, WALLET);
      assert(replayResult.ok, "Replay must succeed.");
      const replayed = replayResult.delivery;
      assert(replayed.status === "delivered", "Replayed delivery must succeed.");
      assert(replayed.replayCount === 1, "replayCount must be incremented.");
      assert(replayed.lastReplayedAt !== undefined, "lastReplayedAt must be set.");
      assert(
        replayed.attempts?.some((a) => a.isReplay === true && a.status === "delivered"),
        "Attempts must include distinct replay record.",
      );
      assert(getDeadLetterDepth(WALLET) === 0, "Successful replay must remove item from DLQ.");
    },
  );
}

async function testBulkReplayDeadLetterQueue() {
  clearDeadLetters();
  const alert = makeAlert();

  const d1 = createAlertDelivery({
    alertId: alert.id,
    walletAddress: WALLET,
    channel: "discord",
    status: "failed",
    attemptCount: 3,
    terminal: true,
    errorDetail: "fail1",
    sanitizedPayload: samplePayload(),
    idempotencyKey: "idem_bulk_1",
  });
  const d2 = createAlertDelivery({
    alertId: alert.id,
    walletAddress: WALLET,
    channel: "discord",
    status: "failed",
    attemptCount: 3,
    terminal: true,
    errorDetail: "fail2",
    sanitizedPayload: samplePayload(),
    idempotencyKey: "idem_bulk_2",
  });

  recordDeadLetter(d1, "fail1");
  recordDeadLetter(d2, "fail2");

  assert(getDeadLetterDepth(WALLET) === 2, "DLQ depth must be 2 before bulk replay.");

  await withEnv(
    {
      ALERT_DISCORD_WEBHOOK_URL: "https://discord.example.test/api/webhooks/1/token",
      ALERT_DELIVERY_BACKOFF_MS: "0",
    },
    async () => {
      installScriptedTransport(async () => ({ status: 204, headers: {}, bodyText: "" }));

      const result = await replayDeadLetterQueue(WALLET);
      assert(result.replayedCount === 2, "Bulk replay must process both entries.");
      assert(result.succeeded === 2, "Both deliveries must succeed.");
      assert(getDeadLetterDepth(WALLET) === 0, "DLQ depth must be 0 after successful bulk replay.");
    },
  );
}

async function testIdempotentDuplicateProtection() {
  const alert = makeAlert();
  const delivery = createAlertDelivery({
    alertId: alert.id,
    walletAddress: WALLET,
    channel: "in_app",
    status: "delivered",
    attemptCount: 1,
    sanitizedPayload: samplePayload(),
    idempotencyKey: "idem_already_delivered",
  });

  const replayResult = await replayAlertDelivery(delivery.id, WALLET);
  assert(!replayResult.ok && replayResult.status === 409, "Replay on delivered alert must return 409 conflict.");
}

async function testGenericWebhookHmacVerification() {
  const alert = makeAlert();
  const payload = samplePayload();
  let receivedHeaders: Record<string, string | undefined> = {};
  let receivedBody = "";

  await withEnv(
    {
      ALERT_WEBHOOK_URL: "https://webhook.example.test/alerts",
      ALERT_WEBHOOK_SECRET: "my-webhook-secret-key",
      ALERT_DELIVERY_BACKOFF_MS: "0",
    },
    async () => {
      installScriptedTransport(async (req) => {
        receivedHeaders = req.headers;
        receivedBody = req.body ?? "";
        return { status: 200, headers: {}, bodyText: '{"ok":true}' };
      });

      const res = await deliverAlertToChannel("webhook", payload, alert, { withRetry: false });
      assert(res.status === "delivered", "Webhook delivery must succeed.");
      assert(Boolean(receivedHeaders["x-alert-signature"]), "Webhook must send x-alert-signature.");
      assert(Boolean(receivedHeaders["x-alert-timestamp"]), "Webhook must send x-alert-timestamp.");
      assert(Boolean(receivedHeaders["x-idempotency-key"]), "Webhook must send x-idempotency-key.");

      const isValid = verifyWebhookSignature(
        receivedBody,
        receivedHeaders["x-alert-signature"] as string,
        receivedHeaders["x-alert-timestamp"] as string,
        "my-webhook-secret-key",
      );
      assert(isValid, "x-alert-signature must be cryptographically valid with correct secret.");
    },
  );
}

async function main() {
  process.env.ALERT_DELIVERY_BACKOFF_MS = "0";

  const tests = [
    ["email HMAC + success", testEmailHmacAndSuccess],
    ["telegram validation", testTelegramValidation],
    ["discord validation", testDiscordValidation],
    ["retryable/terminal failures", testRetryableAndTerminalFailures],
    ["timeout + cancellation", testTimeoutAndCancellation],
    ["duplicate idempotency", testDuplicateIdempotency],
    ["retry path + redaction", testRetryPathAndRedaction],
    ["force-fail + in_app", testForceFailAndInApp],
    ["skipped without config", testSkippedWithoutConfig],
    ["persist + sanitize", testPersistAndSanitizePayload],
    ["pluggable channel registry (zero engine edit)", testPluggableChannelRegistrationZeroEngineEdits],
    ["concurrent fan-out channel isolation", testConcurrentFanoutIsolation],
    ["exponential backoff with jitter", testExponentialBackoffWithJitter],
    ["dead-letter queue + individual replay", testDeadLetterQueueAndIndividualReplay],
    ["bulk replay dead-letter queue", testBulkReplayDeadLetterQueue],
    ["idempotent duplicate protection", testIdempotentDuplicateProtection],
    ["generic webhook HMAC verification", testGenericWebhookHmacVerification],
  ] as const;

  for (const [name, run] of tests) {
    await run();
    console.log(`ok - ${name}`);
  }

  console.log(`alert-delivery-check: ${tests.length} fixtures passed`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
