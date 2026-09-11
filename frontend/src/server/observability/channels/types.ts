import "server-only";
import type {
  Alert,
  AlertDelivery,
  AlertDeliveryChannel,
  AlertDeliveryStatus,
  AlertObservation,
} from "@/server/types";

export type ChannelHealth = {
  healthy: boolean;
  channel: AlertDeliveryChannel;
  configured: boolean;
  details?: string;
};

export type ChannelSendOptions = {
  alertId: string;
  walletAddress?: string;
  idempotencyKey?: string;
  signal?: AbortSignal;
  attempt?: number;
  isReplay?: boolean;
  timeoutMs?: number;
};

export type ChannelSendResult = {
  status: AlertDeliveryStatus;
  providerMessageId?: string;
  errorDetail?: string;
  terminal?: boolean;
  retryable?: boolean;
};

/**
 * Interface contract implemented by each delivery destination channel.
 * Adding a new channel only requires registering an implementation of this
 * interface in the channel registry, requiring zero edits to the alert engine.
 */
export interface AlertChannel {
  readonly id: AlertDeliveryChannel;
  readonly name: string;
  health(): Promise<ChannelHealth>;
  shapePayload(
    alert: Alert,
    evidence?: AlertObservation["evidence"],
  ): AlertDelivery["sanitizedPayload"];
  send(
    payload: AlertDelivery["sanitizedPayload"],
    options: ChannelSendOptions,
  ): Promise<ChannelSendResult>;
}
