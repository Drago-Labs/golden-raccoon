import "server-only";
import crypto from "crypto";
import type {
  Alert,
  AlertDelivery,
  AlertDeliveryChannel,
  AlertDeliveryStatus,
  AlertObservation,
  DeliveryAttemptHistory,
} from "@/server/types";
import { getChannel } from "@/server/observability/channels/registry";
import type { AlertChannel } from "@/server/observability/channels/types";
import { calculateBackoff, isRetryableError } from "./retry";
import { buildDeliveryIdempotencyKey } from "./idempotency";
import { recordDeadLetter } from "./deadLetter";
import { sanitizeDeliveryErrorDetail } from "@/server/observability/alertSanitize";

export type PipelineDeliveryOptions = {
  maxAttempts?: number;
  timeoutMs?: number;
  isReplay?: boolean;
  signal?: AbortSignal;
};

export type SingleChannelPipelineResult = {
  channel: AlertDeliveryChannel;
  status: AlertDeliveryStatus;
  providerMessageId?: string;
  errorDetail?: string;
  terminal?: boolean;
  attemptCount: number;
  attempts: DeliveryAttemptHistory[];
  sanitizedPayload: AlertDelivery["sanitizedPayload"];
  sentAt?: string;
  deadLettered?: boolean;
};

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_MAX_ATTEMPTS = 3;

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Executes delivery for a single channel with timeouts, exponential backoff, and attempt recording.
 */
export async function deliverChannelWithRetries(
  channelImpl: AlertChannel,
  alert: Alert,
  evidence?: AlertObservation["evidence"],
  options: PipelineDeliveryOptions = {},
): Promise<SingleChannelPipelineResult> {
  const timeoutMs =
    options.timeoutMs ??
    (process.env.ALERT_DELIVERY_TIMEOUT_MS
      ? Number(process.env.ALERT_DELIVERY_TIMEOUT_MS)
      : DEFAULT_TIMEOUT_MS);
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;

  const sanitizedPayload = channelImpl.shapePayload(alert, evidence);
  const idempotencyKey = buildDeliveryIdempotencyKey(
    alert.id,
    channelImpl.id,
    options.isReplay ? `replay_${Date.now()}` : "initial",
  );

  const attempts: DeliveryAttemptHistory[] = [];
  let attempt = 0;
  let lastStatus: AlertDeliveryStatus = "pending";
  let lastErrorDetail: string | undefined;
  let lastProviderMessageId: string | undefined;
  let isTerminal = false;
  let sentAt: string | undefined;

  while (attempt < maxAttempts) {
    attempt++;
    const startTime = Date.now();

    if (options.signal?.aborted) {
      const durationMs = Date.now() - startTime;
      lastStatus = "failed";
      lastErrorDetail = "Delivery was cancelled by caller signal.";
      isTerminal = true;
      attempts.push({
        attemptNumber: attempt,
        timestamp: new Date().toISOString(),
        status: "failed",
        errorDetail: lastErrorDetail,
        durationMs,
        isReplay: options.isReplay,
        terminal: true,
      });
      break;
    }

    const timeoutController = new AbortController();
    const timer = setTimeout(() => {
      timeoutController.abort(new Error(`Delivery timed out after ${timeoutMs}ms.`));
    }, timeoutMs);

    let abortListener: (() => void) | undefined;
    if (options.signal) {
      abortListener = () => {
        timeoutController.abort(new Error("Delivery was cancelled."));
      };
      options.signal.addEventListener("abort", abortListener, { once: true });
    }

    try {
      const sendResult = await channelImpl.send(sanitizedPayload, {
        alertId: alert.id,
        walletAddress: alert.walletAddress,
        idempotencyKey,
        signal: timeoutController.signal,
        attempt,
        isReplay: options.isReplay,
        timeoutMs,
      });

      const durationMs = Date.now() - startTime;
      lastStatus = sendResult.status;
      lastProviderMessageId = sendResult.providerMessageId;
      lastErrorDetail = sendResult.errorDetail;
      isTerminal = Boolean(sendResult.terminal);

      attempts.push({
        attemptNumber: attempt,
        timestamp: new Date().toISOString(),
        status: sendResult.status,
        providerMessageId: sendResult.providerMessageId,
        errorDetail: sendResult.errorDetail,
        durationMs,
        isReplay: options.isReplay,
        terminal: isTerminal,
      });

      if (sendResult.status === "delivered") {
        sentAt = new Date().toISOString();
        break;
      }

      if (sendResult.status === "skipped") {
        break;
      }

      if (isTerminal || !isRetryableError(null, sendResult)) {
        isTerminal = true;
        break;
      }

      if (attempt < maxAttempts) {
        const backoffMs = calculateBackoff(attempt);
        if (backoffMs > 0) {
          await sleep(backoffMs);
        }
      }
    } catch (rawError) {
      const durationMs = Date.now() - startTime;
      const sanitizedError = sanitizeDeliveryErrorDetail(rawError);
      lastStatus = "failed";
      lastErrorDetail = sanitizedError;
      const retryable = isRetryableError(rawError);
      isTerminal = !retryable;

      attempts.push({
        attemptNumber: attempt,
        timestamp: new Date().toISOString(),
        status: "failed",
        errorDetail: sanitizedError,
        durationMs,
        isReplay: options.isReplay,
        terminal: isTerminal,
      });

      if (isTerminal || !retryable) {
        break;
      }

      if (attempt < maxAttempts) {
        const backoffMs = calculateBackoff(attempt);
        if (backoffMs > 0) {
          await sleep(backoffMs);
        }
      }
    } finally {
      clearTimeout(timer);
      if (options.signal && abortListener) {
        options.signal.removeEventListener("abort", abortListener);
      }
    }
  }

  let deadLettered = false;
  if (lastStatus === "failed" && !isTerminal) {
    const dummyDelivery: AlertDelivery = {
      id: `del_${crypto.randomUUID()}`,
      alertId: alert.id,
      walletAddress: alert.walletAddress,
      channel: channelImpl.id,
      status: "failed",
      errorDetail: lastErrorDetail,
      sanitizedPayload,
      attemptCount: attempt,
      createdAt: new Date().toISOString(),
      idempotencyKey,
      terminal: false,
      attempts,
    };
    recordDeadLetter(dummyDelivery, lastErrorDetail ?? "Exhausted retry budget", attempts);
    deadLettered = true;
  }

  return {
    channel: channelImpl.id,
    status: lastStatus,
    providerMessageId: lastProviderMessageId,
    errorDetail: lastErrorDetail,
    terminal: isTerminal,
    attemptCount: attempt,
    attempts,
    sanitizedPayload,
    sentAt,
    deadLettered,
  };
}

/**
 * Fans out alert deliveries concurrently across all specified channels with per-channel isolation.
 */
export async function executeDeliveryPipeline(
  channels: AlertDeliveryChannel[],
  alert: Alert,
  evidence?: AlertObservation["evidence"],
  options: PipelineDeliveryOptions = {},
): Promise<SingleChannelPipelineResult[]> {
  const tasks = channels.map(async (channelId) => {
    const channelImpl = getChannel(channelId);
    if (!channelImpl) {
      const sanitizedPayload = {
        triggerType: alert.triggerType,
        severity: alert.severity,
        summary: alert.message,
        beforeValue: alert.beforeValue,
        afterValue: alert.afterValue,
        observationKey: alert.observationKey,
        evidenceLinks: [],
      };
      return {
        channel: channelId,
        status: "failed" as AlertDeliveryStatus,
        errorDetail: `Unknown or unregistered channel: ${channelId}`,
        terminal: true,
        attemptCount: 0,
        attempts: [],
        sanitizedPayload,
      };
    }

    return deliverChannelWithRetries(channelImpl, alert, evidence, options);
  });

  const settled = await Promise.allSettled(tasks);

  return settled.map((result, idx) => {
    if (result.status === "fulfilled") {
      return result.value;
    }

    const channelId = channels[idx];
    return {
      channel: channelId,
      status: "failed" as AlertDeliveryStatus,
      errorDetail: sanitizeDeliveryErrorDetail(result.reason),
      terminal: false,
      attemptCount: 1,
      attempts: [
        {
          attemptNumber: 1,
          timestamp: new Date().toISOString(),
          status: "failed",
          errorDetail: sanitizeDeliveryErrorDetail(result.reason),
        },
      ],
      sanitizedPayload: {
        triggerType: alert.triggerType,
        severity: alert.severity,
        summary: alert.message,
        beforeValue: alert.beforeValue,
        afterValue: alert.afterValue,
        observationKey: alert.observationKey,
        evidenceLinks: [],
      },
    };
  });
}
