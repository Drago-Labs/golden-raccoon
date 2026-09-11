import "server-only";
import crypto from "crypto";
import type { Alert, AlertDelivery, AlertObservation } from "@/server/types";
import {
  HttpTransportError,
  sendAlertHttpRequest,
  throwForHttpStatus,
} from "@/server/observability/delivery/http";
import {
  buildSanitizedAlertPayload,
  sanitizeDeliveryErrorDetail,
} from "@/server/observability/alertSanitize";
import type {
  AlertChannel,
  ChannelHealth,
  ChannelSendOptions,
  ChannelSendResult,
} from "./types";

/**
 * Signs webhook payload with HMAC-SHA256 over timestamp + "." + body.
 */
export function signWebhookPayload(secret: string, timestamp: string, body: string): string {
  return crypto.createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

/**
 * Cryptographically verifies an incoming webhook signature using timingSafeEqual.
 */
export function verifyWebhookSignature(
  body: string,
  signatureHeader: string,
  timestamp: string,
  secret: string,
): boolean {
  try {
    const rawSignature = signatureHeader.startsWith("sha256=")
      ? signatureHeader.slice("sha256=".length)
      : signatureHeader;
    const expectedSignature = signWebhookPayload(secret, timestamp, body);
    const sigBuf = Buffer.from(rawSignature, "hex");
    const expBuf = Buffer.from(expectedSignature, "hex");
    if (sigBuf.length !== expBuf.length) {
      return false;
    }
    return crypto.timingSafeEqual(sigBuf, expBuf);
  } catch {
    return false;
  }
}

function parseWebhookMessageId(bodyText: string): string | undefined {
  if (!bodyText.trim()) return undefined;
  try {
    const parsed = JSON.parse(bodyText) as { ok?: unknown; id?: unknown };
    if (parsed.ok === false) return undefined;
    if (typeof parsed.id === "string" && parsed.id.trim()) return parsed.id.trim();
    if (typeof parsed.id === "number" && Number.isFinite(parsed.id)) return String(parsed.id);
  } catch {
    return undefined;
  }
  return undefined;
}

export class WebhookChannel implements AlertChannel {
  readonly id = "webhook" as const;
  readonly name = "Generic Webhook";

  async health(): Promise<ChannelHealth> {
    const url = process.env.ALERT_WEBHOOK_URL?.trim();
    return {
      healthy: Boolean(url),
      channel: this.id,
      configured: Boolean(url),
      details: url ? "Webhook URL configured" : "ALERT_WEBHOOK_URL is not set",
    };
  }

  shapePayload(
    alert: Alert,
    evidence?: AlertObservation["evidence"],
  ): AlertDelivery["sanitizedPayload"] {
    return buildSanitizedAlertPayload(alert, evidence);
  }

  async send(
    payload: AlertDelivery["sanitizedPayload"],
    options: ChannelSendOptions,
  ): Promise<ChannelSendResult> {
    const url = process.env.ALERT_WEBHOOK_URL?.trim();
    if (!url) {
      return {
        status: "skipped",
        errorDetail: "ALERT_WEBHOOK_URL is not configured",
        terminal: true,
      };
    }

    const secret = process.env.ALERT_WEBHOOK_SECRET?.trim();
    const timestamp = new Date().toISOString();
    const body = JSON.stringify({
      channel: "webhook",
      timestamp,
      alertId: options.alertId,
      attempt: options.attempt,
      isReplay: Boolean(options.isReplay),
      payload,
    });

    const headers: Record<string, string> = {
      "content-type": "application/json",
      accept: "application/json",
      "x-alert-timestamp": timestamp,
    };

    if (secret) {
      const signature = signWebhookPayload(secret, timestamp, body);
      headers["x-alert-signature"] = `sha256=${signature}`;
    }

    const idempotencyKey = options.idempotencyKey ?? crypto.randomUUID();
    headers["x-idempotency-key"] = idempotencyKey;

    try {
      const response = await sendAlertHttpRequest({
        url,
        method: "POST",
        headers,
        body,
        signal: options.signal,
        timeoutMs: options.timeoutMs,
      });

      if (response.status === 204) {
        return { status: "delivered" };
      }

      if (response.status < 200 || response.status >= 300) {
        throwForHttpStatus(response.status);
      }

      const providerMessageId = parseWebhookMessageId(response.bodyText);
      return {
        status: "delivered",
        providerMessageId,
      };
    } catch (err) {
      const errorDetail = sanitizeDeliveryErrorDetail(err);
      if (err instanceof HttpTransportError) {
        return {
          status: "failed",
          errorDetail,
          terminal: err.terminal,
          retryable: err.retryable,
        };
      }
      return {
        status: "failed",
        errorDetail,
        terminal: false,
        retryable: true,
      };
    }
  }
}

export const webhookChannel = new WebhookChannel();
