import "server-only";
import crypto from "crypto";
import type { AlertDelivery, AlertDeliveryStatus } from "@/server/types";

/**
 * Generates an idempotency key scoped to an alert, channel, and lifecycle event.
 */
export function buildDeliveryIdempotencyKey(
  alertId: string,
  channel: string,
  event: string = "initial",
): string {
  const raw = `${alertId}:${channel}:${event}`;
  return crypto.createHash("sha256").update(raw).digest("hex");
}

/**
 * Generates a distinct idempotency key for replay attempts.
 */
export function buildReplayIdempotencyKey(
  deliveryId: string,
  replayAttempt: number,
): string {
  const raw = `replay:${deliveryId}:${replayAttempt}:${Date.now()}`;
  return crypto.createHash("sha256").update(raw).digest("hex");
}

/**
 * Checks whether a delivery has already reached terminal delivered status.
 * Replays must not duplicate delivery if the recipient already received it.
 */
export function isAlreadyDelivered(status: AlertDeliveryStatus): boolean {
  return status === "delivered";
}
