import "server-only";
import type { AlertDeliveryStatus, DeliveryAttemptHistory } from "@/server/types";
import { HttpTransportError } from "./http";

export type DeliveryAttemptRecord = DeliveryAttemptHistory;

export type BackoffOptions = {
  baseMs?: number;
  maxMs?: number;
  factor?: number;
  jitterRatio?: number;
};

/**
 * Calculates exponential backoff with jitter for delivery attempts.
 * Honors the ALERT_DELIVERY_BACKOFF_MS environment variable when set.
 */
export function calculateBackoff(
  attempt: number,
  options: BackoffOptions = {},
): number {
  const envOverride = process.env.ALERT_DELIVERY_BACKOFF_MS;
  const baseMs =
    options.baseMs ??
    (envOverride !== undefined && !Number.isNaN(Number(envOverride))
      ? Math.max(0, Number(envOverride))
      : 1000);

  if (baseMs === 0) {
    return 0;
  }

  const factor = options.factor ?? 2;
  const maxMs = options.maxMs ?? 30_000;
  const jitterRatio = options.jitterRatio ?? 0.2;

  const exponential = Math.min(maxMs, baseMs * Math.pow(factor, Math.max(0, attempt - 1)));
  const jitter = Math.floor(Math.random() * (exponential * jitterRatio));

  return Math.min(maxMs, exponential + jitter);
}

/**
 * Determines whether a delivery error or failure result is retryable.
 */
export function isRetryableError(
  error: unknown,
  result?: { terminal?: boolean; retryable?: boolean; status?: AlertDeliveryStatus },
): boolean {
  if (result?.terminal === true) {
    return false;
  }
  if (result?.retryable !== undefined) {
    return result.retryable;
  }
  if (result?.status === "delivered" || result?.status === "skipped") {
    return false;
  }

  if (error instanceof HttpTransportError) {
    return error.retryable && !error.terminal;
  }

  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (
      msg.includes("abort") ||
      msg.includes("timeout") ||
      msg.includes("econnrefused") ||
      msg.includes("econnreset") ||
      msg.includes("etimedout") ||
      msg.includes("network") ||
      msg.includes("500") ||
      msg.includes("502") ||
      msg.includes("503") ||
      msg.includes("504") ||
      msg.includes("429") ||
      msg.includes("rate limit")
    ) {
      return true;
    }
    if (
      msg.includes("missing") ||
      msg.includes("not configured") ||
      msg.includes("unauthorized") ||
      msg.includes("forbidden") ||
      msg.includes("invalid") ||
      msg.includes("malformed")
    ) {
      return false;
    }
  }

  return true;
}
