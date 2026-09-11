import "server-only";
import type {
  Alert,
  AlertDelivery,
  AlertDeliveryChannel,
  DeliveryAttemptHistory,
} from "@/server/types";
import {
  createAlertDelivery,
  listAlertDeliveries,
  updateAlertDelivery,
} from "@/server/storage";
import { sanitizeDeliveryErrorDetail } from "@/server/observability/alertSanitize";
import { HttpTransportError } from "@/server/observability/delivery/http";
import { getChannel } from "@/server/observability/channels";
import type { AlertChannel } from "@/server/observability/channels/types";
import {
  getDeadLetterDepth,
  getDeadLetterEntry,
  listDeadLetters,
  markDeadLetterReplayed,
  recordDeadLetter,
  removeDeadLetterEntry,
} from "@/server/observability/delivery/deadLetter";
import { buildReplayIdempotencyKey } from "@/server/observability/delivery/idempotency";

export type DeliveryResult = {
  status: AlertDelivery["status"];
  channel: AlertDeliveryChannel;
  errorDetail?: string;
  attemptCount?: number;
  providerMessageId?: string;
  terminal?: boolean;
  nextRetryAt?: string;
  lastAttemptAt?: string;
  attempts?: DeliveryAttemptHistory[];
};

export type DeliverAlertOptions = {
  idempotencyKey?: string;
  withRetry?: boolean;
  signal?: AbortSignal;
  timeoutMs?: number;
};

export type RetryAlertDeliveryResult =
  | { ok: true; delivery: AlertDelivery }
  | { ok: false; status: number; error: string };

export type BulkReplayResult = {
  replayedCount: number;
  succeeded: number;
  failed: number;
  results: Array<{
    deliveryId: string;
    status: AlertDelivery["status"];
    error?: string;
  }>;
};

const MAX_ATTEMPTS = 3;
const DEFAULT_BACKOFF_MS = 250;

/**
 * Single entry point that the alert engine fans out to. Each channel has
 * its own registered channel adapter; all adapters return a DeliveryResult so the
 * engine can persist the audit row.
 *
 * Test/chaos hook: `ALERT_FORCE_FAIL_CHANNELS=email,discord` flips the
 * matching channels to a deterministic "failed" result so the failure path
 * of the alert engine can be exercised in fixtures and staging.
 *
 * Adapters never claim `delivered` without a validated provider response.
 */
export async function deliverAlertToChannel(
  channel: AlertDeliveryChannel,
  payload: AlertDelivery["sanitizedPayload"],
  alert: Pick<Alert, "walletAddress" | "triggerType" | "severity">,
  options: DeliverAlertOptions = {},
): Promise<DeliveryResult> {
  const forcedFailures = getForcedFailureChannels();

  if (forcedFailures.has(channel)) {
    return {
      status: "failed",
      channel,
      errorDetail: "ALERT_FORCE_FAIL_CHANNELS override forced this channel to fail.",
      attemptCount: 1,
      terminal: true,
      lastAttemptAt: new Date().toISOString(),
      attempts: [
        {
          attemptNumber: 1,
          timestamp: new Date().toISOString(),
          status: "failed",
          errorDetail: "ALERT_FORCE_FAIL_CHANNELS override forced this channel to fail.",
          terminal: true,
        },
      ],
    };
  }

  if (options.signal?.aborted) {
    return {
      status: "failed",
      channel,
      errorDetail: sanitizeDeliveryErrorDetail("Delivery request was cancelled."),
      attemptCount: 0,
      terminal: true,
      lastAttemptAt: new Date().toISOString(),
      attempts: [],
    };
  }

  const channelImpl = getChannel(channel);
  if (!channelImpl) {
    return {
      status: "skipped",
      channel,
      errorDetail: `Unknown or unregistered channel: ${channel}`,
      attemptCount: 0,
      terminal: true,
      lastAttemptAt: new Date().toISOString(),
      attempts: [],
    };
  }

  const maxAttempts = options.withRetry === false ? 1 : MAX_ATTEMPTS;
  let lastFailure: DeliveryResult | undefined;
  const attempts: DeliveryAttemptHistory[] = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (options.signal?.aborted) {
      return {
        status: "failed",
        channel,
        errorDetail: sanitizeDeliveryErrorDetail("Delivery request was cancelled."),
        attemptCount: attempt - 1,
        terminal: true,
        lastAttemptAt: new Date().toISOString(),
        attempts,
      };
    }

    const startTime = Date.now();
    const result = await deliverOnce(channelImpl, payload, alert, { ...options, attempt });
    const durationMs = Date.now() - startTime;
    const isTerminal = Boolean(result.terminal);

    const attemptRecord: DeliveryAttemptHistory = {
      attemptNumber: attempt,
      timestamp: new Date().toISOString(),
      status: result.status,
      providerMessageId: result.providerMessageId,
      errorDetail: result.errorDetail,
      durationMs,
      terminal: isTerminal,
    };
    attempts.push(attemptRecord);

    const stamped: DeliveryResult = {
      ...result,
      attemptCount: attempt,
      lastAttemptAt: new Date().toISOString(),
      attempts,
    };

    if (result.status === "delivered" || result.status === "skipped") {
      return stamped;
    }

    if (result.terminal) {
      return { ...stamped, terminal: true };
    }

    lastFailure = stamped;

    if (attempt < maxAttempts) {
      const delayMs = resolveBackoffMs(attempt);
      if (delayMs > 0) {
        const nextRetryAt = new Date(Date.now() + delayMs).toISOString();
        lastFailure = { ...stamped, nextRetryAt };
        await sleep(delayMs);
      }
    }
  }

  return {
    status: "failed",
    channel,
    errorDetail: lastFailure?.errorDetail ?? "Delivery failed after bounded retries.",
    attemptCount: maxAttempts,
    terminal: true,
    lastAttemptAt: new Date().toISOString(),
    attempts,
    ...(lastFailure?.nextRetryAt ? { nextRetryAt: lastFailure.nextRetryAt } : {}),
  };
}

export function buildDeliveryIdempotencyKey(
  alertId: string,
  channel: AlertDeliveryChannel,
  event: string,
): string {
  return `${alertId}:${channel}:${event}`;
}

export function findDeliveryByIdempotencyKey(
  alertId: string,
  walletAddress: string,
  idempotencyKey: string,
): AlertDelivery | undefined {
  const wallet = walletAddress.trim().toLowerCase();

  return listAlertDeliveries(alertId, wallet).find(
    (delivery) => delivery.idempotencyKey === idempotencyKey,
  );
}

export function persistDeliveryResult(
  alert: Pick<Alert, "id" | "walletAddress">,
  channel: AlertDeliveryChannel,
  payload: AlertDelivery["sanitizedPayload"],
  result: DeliveryResult,
  idempotencyKey: string,
): AlertDelivery {
  const existing = findDeliveryByIdempotencyKey(alert.id, alert.walletAddress, idempotencyKey);
  const patch: Partial<AlertDelivery> = {
    status: result.status,
    attemptCount: result.attemptCount ?? 0,
    ...(result.errorDetail
      ? { errorDetail: sanitizeDeliveryErrorDetail(result.errorDetail) }
      : { errorDetail: undefined }),
    ...(result.providerMessageId ? { providerMessageId: result.providerMessageId } : {}),
    ...(result.terminal !== undefined ? { terminal: result.terminal } : {}),
    ...(result.nextRetryAt ? { nextRetryAt: result.nextRetryAt } : {}),
    ...(result.lastAttemptAt ? { lastAttemptAt: result.lastAttemptAt } : {}),
    ...(result.status === "delivered" ? { sentAt: new Date().toISOString() } : {}),
    ...(result.attempts ? { attempts: result.attempts } : {}),
    idempotencyKey,
    sanitizedPayload: payload,
  };

  let delivery: AlertDelivery;

  if (existing) {
    delivery =
      updateAlertDelivery(existing.id, alert.walletAddress, patch) ?? {
        ...existing,
        ...patch,
      };
  } else {
    delivery = createAlertDelivery({
      alertId: alert.id,
      walletAddress: alert.walletAddress,
      channel,
      status: result.status,
      sanitizedPayload: payload,
      attemptCount: result.attemptCount ?? 0,
      idempotencyKey,
      ...(result.errorDetail ? { errorDetail: sanitizeDeliveryErrorDetail(result.errorDetail) } : {}),
      ...(result.providerMessageId ? { providerMessageId: result.providerMessageId } : {}),
      ...(result.terminal !== undefined ? { terminal: result.terminal } : {}),
      ...(result.nextRetryAt ? { nextRetryAt: result.nextRetryAt } : {}),
      ...(result.lastAttemptAt ? { lastAttemptAt: result.lastAttemptAt } : {}),
      ...(result.status === "delivered" ? { sentAt: new Date().toISOString() } : {}),
      ...(result.attempts ? { attempts: result.attempts } : {}),
    });
  }

  if (delivery.status === "failed") {
    recordDeadLetter(delivery, delivery.errorDetail ?? "Delivery failed after bounded retries", result.attempts);
  }

  return delivery;
}

/**
 * Wallet-scoped operator retry for a failed, non-terminal delivery.
 * Never retries recipient/config terminal failures.
 */
export async function retryAlertDelivery(
  deliveryId: string,
  walletAddress: string,
): Promise<RetryAlertDeliveryResult> {
  const wallet = walletAddress.trim().toLowerCase();
  const delivery = listAlertDeliveries(undefined, wallet).find((row) => row.id === deliveryId);

  if (!delivery) {
    return { ok: false, status: 404, error: "Delivery not found." };
  }

  if (delivery.status === "delivered") {
    return { ok: false, status: 409, error: "Delivery already completed." };
  }

  if (delivery.terminal === true) {
    return { ok: false, status: 409, error: "Terminal failures must not be retried." };
  }

  if (delivery.status !== "failed" && delivery.status !== "pending") {
    return { ok: false, status: 409, error: "Only pending or failed deliveries can be retried." };
  }

  const result = await deliverAlertToChannel(
    delivery.channel,
    delivery.sanitizedPayload,
    {
      walletAddress: delivery.walletAddress,
      triggerType: delivery.sanitizedPayload.triggerType,
      severity: delivery.sanitizedPayload.severity,
    },
    {
      idempotencyKey: delivery.idempotencyKey,
      withRetry: true,
    },
  );

  const existingAttempts = delivery.attempts ?? [];
  const newAttempts = result.attempts ?? [];
  const mergedAttempts = [...existingAttempts, ...newAttempts];

  const updated = updateAlertDelivery(delivery.id, wallet, {
    status: result.status,
    attemptCount: (delivery.attemptCount ?? 0) + (result.attemptCount ?? 1),
    ...(result.errorDetail
      ? { errorDetail: sanitizeDeliveryErrorDetail(result.errorDetail) }
      : { errorDetail: undefined }),
    ...(result.providerMessageId ? { providerMessageId: result.providerMessageId } : {}),
    ...(result.terminal !== undefined ? { terminal: result.terminal } : {}),
    ...(result.nextRetryAt ? { nextRetryAt: result.nextRetryAt } : {}),
    ...(result.lastAttemptAt ? { lastAttemptAt: result.lastAttemptAt } : {}),
    ...(result.status === "delivered" ? { sentAt: new Date().toISOString() } : {}),
    attempts: mergedAttempts,
  });

  if (!updated) {
    return { ok: false, status: 500, error: "Failed to persist delivery retry." };
  }

  if (result.status === "delivered") {
    removeDeadLetterEntry(delivery.id, wallet);
  }

  return { ok: true, delivery: updated };
}

/**
 * Operator replay for dead-lettered deliveries with distinct replay tracking.
 * Checks idempotency: if already delivered, skips sending to prevent duplicates.
 */
export async function replayAlertDelivery(
  deliveryId: string,
  walletAddress: string,
): Promise<RetryAlertDeliveryResult> {
  const wallet = walletAddress.trim().toLowerCase();
  const delivery = listAlertDeliveries(undefined, wallet).find((row) => row.id === deliveryId);

  if (!delivery) {
    return { ok: false, status: 404, error: "Delivery not found." };
  }

  if (delivery.status === "delivered") {
    return { ok: false, status: 409, error: "Delivery already completed." };
  }

  const channelImpl = getChannel(delivery.channel);
  if (!channelImpl) {
    return { ok: false, status: 400, error: `Channel ${delivery.channel} is not registered.` };
  }

  const replayCount = (delivery.replayCount ?? 0) + 1;
  const replayAttemptNumber = (delivery.attemptCount ?? 0) + 1;
  const replayIdempotencyKey = buildReplayIdempotencyKey(delivery.id, replayCount);

  const startTime = Date.now();
  const result = await deliverOnce(channelImpl, delivery.sanitizedPayload, {
    walletAddress: delivery.walletAddress,
    triggerType: delivery.sanitizedPayload.triggerType,
    severity: delivery.sanitizedPayload.severity,
  }, {
    idempotencyKey: replayIdempotencyKey,
    attempt: replayAttemptNumber,
  });
  const durationMs = Date.now() - startTime;

  const replayAttemptRecord: DeliveryAttemptHistory = {
    attemptNumber: replayAttemptNumber,
    timestamp: new Date().toISOString(),
    status: result.status,
    providerMessageId: result.providerMessageId,
    errorDetail: result.errorDetail,
    durationMs,
    isReplay: true,
    terminal: result.terminal,
  };

  const existingAttempts = delivery.attempts ?? [];
  const updatedAttempts = [...existingAttempts, replayAttemptRecord];

  const patch: Partial<AlertDelivery> = {
    status: result.status,
    attemptCount: replayAttemptNumber,
    replayCount,
    lastReplayedAt: new Date().toISOString(),
    lastAttemptAt: new Date().toISOString(),
    attempts: updatedAttempts,
    ...(result.errorDetail
      ? { errorDetail: sanitizeDeliveryErrorDetail(result.errorDetail) }
      : { errorDetail: undefined }),
    ...(result.providerMessageId ? { providerMessageId: result.providerMessageId } : {}),
    ...(result.terminal !== undefined ? { terminal: result.terminal } : {}),
    ...(result.status === "delivered" ? { sentAt: new Date().toISOString() } : {}),
  };

  const updated = updateAlertDelivery(delivery.id, wallet, patch);
  if (!updated) {
    return { ok: false, status: 500, error: "Failed to persist delivery replay." };
  }

  if (result.status === "delivered") {
    removeDeadLetterEntry(delivery.id, wallet);
  } else {
    markDeadLetterReplayed(delivery.id, result.errorDetail ?? "Replay delivery failed", replayAttemptRecord);
  }

  return { ok: true, delivery: updated };
}

/**
 * Bulk replay for all dead-lettered deliveries for a wallet.
 */
export async function replayDeadLetterQueue(
  walletAddress: string,
): Promise<BulkReplayResult> {
  const deadLetters = listDeadLetters(walletAddress);
  const results: BulkReplayResult["results"] = [];
  let succeeded = 0;
  let failed = 0;

  for (const dl of deadLetters) {
    const res = await replayAlertDelivery(dl.deliveryId, walletAddress);
    if (res.ok && res.delivery.status === "delivered") {
      succeeded++;
      results.push({ deliveryId: dl.deliveryId, status: "delivered" });
    } else {
      failed++;
      results.push({
        deliveryId: dl.deliveryId,
        status: res.ok ? res.delivery.status : "failed",
        error: res.ok ? res.delivery.errorDetail : res.error,
      });
    }
  }

  return {
    replayedCount: deadLetters.length,
    succeeded,
    failed,
    results,
  };
}

function getForcedFailureChannels(): Set<AlertDeliveryChannel> {
  const raw = process.env.ALERT_FORCE_FAIL_CHANNELS;
  if (!raw) return new Set();
  const out = new Set<AlertDeliveryChannel>();

  for (const piece of raw.split(",")) {
    const trimmed = piece.trim().toLowerCase();
    if (
      trimmed === "in_app" ||
      trimmed === "email" ||
      trimmed === "telegram" ||
      trimmed === "discord" ||
      trimmed === "webhook"
    ) {
      out.add(trimmed as AlertDeliveryChannel);
    }
  }

  return out;
}

async function deliverOnce(
  channelImpl: AlertChannel,
  payload: AlertDelivery["sanitizedPayload"],
  alert: Pick<Alert, "walletAddress" | "triggerType" | "severity">,
  options: DeliverAlertOptions & { attempt?: number },
): Promise<DeliveryResult> {
  try {
    const res = await channelImpl.send(payload, {
      alertId: "",
      walletAddress: alert.walletAddress,
      idempotencyKey: options.idempotencyKey,
      signal: options.signal,
      attempt: options.attempt,
      timeoutMs: options.timeoutMs,
    });

    if (res.status === "skipped") {
      return {
        status: "skipped",
        channel: channelImpl.id,
        errorDetail: res.errorDetail,
        terminal: true,
      };
    }

    if (res.status === "failed") {
      return {
        status: "failed",
        channel: channelImpl.id,
        errorDetail: res.errorDetail ? sanitizeDeliveryErrorDetail(res.errorDetail) : "Delivery failed.",
        terminal: res.terminal,
      };
    }

    return {
      status: "delivered",
      channel: channelImpl.id,
      providerMessageId: res.providerMessageId,
      terminal: false,
    };
  } catch (error) {
    if (error instanceof HttpTransportError) {
      return {
        status: "failed",
        channel: channelImpl.id,
        errorDetail: sanitizeDeliveryErrorDetail(error.message),
        terminal: error.terminal,
      };
    }

    const message = error instanceof Error ? error.message : "Delivery failed.";
    return {
      status: "failed",
      channel: channelImpl.id,
      errorDetail: sanitizeDeliveryErrorDetail(message),
      terminal: false,
    };
  }
}

export function resolveBackoffMs(attempt: number): number {
  const raw = process.env.ALERT_DELIVERY_BACKOFF_MS;
  if (raw !== undefined && raw !== "") {
    const override = Number(raw);
    if (Number.isFinite(override)) return Math.max(0, override);
  }

  const base = DEFAULT_BACKOFF_MS * 2 ** Math.max(0, attempt - 1);
  const jitter = Math.floor(Math.random() * (base * 0.2));
  return base + jitter;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
