import "server-only";
import type { Alert, AlertDelivery, AlertObservation } from "@/server/types";
import { deliverEmailAlert } from "@/server/observability/delivery/email";
import { HttpTransportError } from "@/server/observability/delivery/http";
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

export class EmailChannel implements AlertChannel {
  readonly id = "email" as const;
  readonly name = "Email";

  async health(): Promise<ChannelHealth> {
    const url = process.env.ALERT_EMAIL_WEBHOOK_URL?.trim();
    const secret = process.env.ALERT_EMAIL_WEBHOOK_SECRET?.trim();
    const configured = Boolean(url && secret);
    return {
      healthy: configured,
      channel: this.id,
      configured,
      details: configured
        ? "Email webhook configured"
        : "ALERT_EMAIL_WEBHOOK_URL or ALERT_EMAIL_WEBHOOK_SECRET is missing",
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
    try {
      const result = await deliverEmailAlert(
        payload,
        {
          walletAddress: options.walletAddress ?? "",
          triggerType: payload.triggerType,
          severity: payload.severity,
        },
        {
          idempotencyKey: options.idempotencyKey,
          signal: options.signal,
        },
      );

      if ("skipped" in result && result.skipped) {
        return {
          status: "skipped",
          errorDetail: result.reason,
          terminal: true,
        };
      }

      return {
        status: "delivered",
        providerMessageId: result.providerMessageId,
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

export const emailChannel = new EmailChannel();
