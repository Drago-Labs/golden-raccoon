import "server-only";
import type { Alert, AlertDelivery, AlertObservation } from "@/server/types";
import { buildSanitizedAlertPayload } from "@/server/observability/alertSanitize";
import type {
  AlertChannel,
  ChannelHealth,
  ChannelSendOptions,
  ChannelSendResult,
} from "./types";

export class InAppChannel implements AlertChannel {
  readonly id = "in_app" as const;
  readonly name = "In-App Notification";

  async health(): Promise<ChannelHealth> {
    return {
      healthy: true,
      channel: this.id,
      configured: true,
      details: "In-app delivery channel is always active",
    };
  }

  shapePayload(
    alert: Alert,
    evidence?: AlertObservation["evidence"],
  ): AlertDelivery["sanitizedPayload"] {
    return buildSanitizedAlertPayload(alert, evidence);
  }

  async send(
    _payload: AlertDelivery["sanitizedPayload"],
    options: ChannelSendOptions,
  ): Promise<ChannelSendResult> {
    if (process.env.TEST_ALERT_DELIVERY_FORCE_FAIL === "true") {
      return {
        status: "failed",
        errorDetail: "Simulated transport error for test",
        terminal: false,
        retryable: true,
      };
    }

    return {
      status: "delivered",
      providerMessageId: `in_app_${options.alertId}`,
    };
  }
}

export const inAppChannel = new InAppChannel();
