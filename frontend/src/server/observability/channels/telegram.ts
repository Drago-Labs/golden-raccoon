import "server-only";
import type { Alert, AlertDelivery, AlertObservation } from "@/server/types";
import { deliverTelegramAlert } from "@/server/observability/delivery/telegram";
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

export class TelegramChannel implements AlertChannel {
  readonly id = "telegram" as const;
  readonly name = "Telegram";

  async health(): Promise<ChannelHealth> {
    const token = process.env.ALERT_TELEGRAM_BOT_TOKEN?.trim();
    const chatId = process.env.ALERT_TELEGRAM_CHAT_ID?.trim();
    const configured = Boolean(token && chatId);
    return {
      healthy: configured,
      channel: this.id,
      configured,
      details: configured
        ? "Telegram bot configured"
        : "ALERT_TELEGRAM_BOT_TOKEN or ALERT_TELEGRAM_CHAT_ID is missing",
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
      const result = await deliverTelegramAlert(
        payload,
        {
          walletAddress: options.walletAddress ?? "",
          triggerType: payload.triggerType,
          severity: payload.severity,
        },
        {
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
      const errObj = err as { terminal?: boolean; retryable?: boolean } | null;
      const terminal = errObj?.terminal !== undefined ? Boolean(errObj.terminal) : (err instanceof HttpTransportError ? err.terminal : false);
      const retryable = errObj?.retryable !== undefined ? Boolean(errObj.retryable) : (err instanceof HttpTransportError ? err.retryable : true);
      return {
        status: "failed",
        errorDetail,
        terminal,
        retryable,
      };
    }
  }
}

export const telegramChannel = new TelegramChannel();
