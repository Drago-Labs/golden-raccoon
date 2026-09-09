import "server-only";
import type { Alert, AlertDelivery, AlertObservation } from "@/server/types";
import { deliverDiscordAlert } from "@/server/observability/delivery/discord";
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

export class DiscordChannel implements AlertChannel {
  readonly id = "discord" as const;
  readonly name = "Discord";

  async health(): Promise<ChannelHealth> {
    const url = process.env.ALERT_DISCORD_WEBHOOK_URL?.trim();
    const configured = Boolean(url);
    return {
      healthy: configured,
      channel: this.id,
      configured,
      details: configured
        ? "Discord webhook configured"
        : "ALERT_DISCORD_WEBHOOK_URL is missing",
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
      const result = await deliverDiscordAlert(
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

export const discordChannel = new DiscordChannel();
