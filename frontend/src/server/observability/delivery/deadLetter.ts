import "server-only";
import crypto from "crypto";
import type { AlertDelivery, DeliveryAttemptHistory } from "@/server/types";

export type DeadLetterEntry = {
  id: string;
  deliveryId: string;
  alertId: string;
  walletAddress: string;
  channel: string;
  sanitizedPayload: AlertDelivery["sanitizedPayload"];
  attemptCount: number;
  lastError: string;
  failedAt: string;
  replayCount: number;
  lastReplayedAt?: string;
  history: DeliveryAttemptHistory[];
};

const deadLetterStore = new Map<string, DeadLetterEntry>();

/**
 * Normalizes wallet address for lookup consistency.
 */
function normalizeWallet(walletAddress?: string): string | undefined {
  return walletAddress?.trim().toLowerCase();
}

/**
 * Records a failed delivery into the dead-letter queue when retries are exhausted.
 */
export function recordDeadLetter(
  delivery: AlertDelivery,
  errorDetail: string,
  history: DeliveryAttemptHistory[] = [],
): DeadLetterEntry {
  const existing = Array.from(deadLetterStore.values()).find(
    (entry) => entry.deliveryId === delivery.id,
  );

  const entry: DeadLetterEntry = {
    id: existing?.id ?? `dlq_${crypto.randomUUID()}`,
    deliveryId: delivery.id,
    alertId: delivery.alertId,
    walletAddress: delivery.walletAddress,
    channel: delivery.channel,
    sanitizedPayload: delivery.sanitizedPayload,
    attemptCount: delivery.attemptCount,
    lastError: errorDetail,
    failedAt: new Date().toISOString(),
    replayCount: existing?.replayCount ?? 0,
    lastReplayedAt: existing?.lastReplayedAt,
    history: history.length > 0 ? history : (delivery.attempts ?? []),
  };

  deadLetterStore.set(entry.id, entry);
  return entry;
}

/**
 * Returns current depth of the dead-letter queue, optionally filtered by wallet.
 */
export function getDeadLetterDepth(walletAddress?: string): number {
  if (!walletAddress) {
    return deadLetterStore.size;
  }
  const norm = normalizeWallet(walletAddress);
  let count = 0;
  for (const entry of deadLetterStore.values()) {
    if (normalizeWallet(entry.walletAddress) === norm) {
      count++;
    }
  }
  return count;
}

/**
 * Lists dead-letter queue entries, optionally filtered by wallet address.
 */
export function listDeadLetters(walletAddress?: string): DeadLetterEntry[] {
  const entries = Array.from(deadLetterStore.values());
  if (!walletAddress) {
    return entries.sort(
      (a, b) => new Date(b.failedAt).getTime() - new Date(a.failedAt).getTime(),
    );
  }
  const norm = normalizeWallet(walletAddress);
  return entries
    .filter((entry) => normalizeWallet(entry.walletAddress) === norm)
    .sort(
      (a, b) => new Date(b.failedAt).getTime() - new Date(a.failedAt).getTime(),
    );
}

/**
 * Finds a dead-letter entry by entry ID or delivery ID.
 */
export function getDeadLetterEntry(
  idOrDeliveryId: string,
  walletAddress?: string,
): DeadLetterEntry | undefined {
  const norm = walletAddress ? normalizeWallet(walletAddress) : undefined;
  for (const entry of deadLetterStore.values()) {
    if (entry.id === idOrDeliveryId || entry.deliveryId === idOrDeliveryId) {
      if (!norm || normalizeWallet(entry.walletAddress) === norm) {
        return entry;
      }
    }
  }
  return undefined;
}

/**
 * Removes a dead-letter entry after successful replay or manual removal.
 */
export function removeDeadLetterEntry(
  idOrDeliveryId: string,
  walletAddress?: string,
): boolean {
  const entry = getDeadLetterEntry(idOrDeliveryId, walletAddress);
  if (!entry) return false;
  return deadLetterStore.delete(entry.id);
}

/**
 * Clears the dead-letter queue, optionally scoped to a wallet.
 */
export function clearDeadLetters(walletAddress?: string): void {
  if (!walletAddress) {
    deadLetterStore.clear();
    return;
  }
  const norm = normalizeWallet(walletAddress);
  for (const [id, entry] of deadLetterStore.entries()) {
    if (normalizeWallet(entry.walletAddress) === norm) {
      deadLetterStore.delete(id);
    }
  }
}

/**
 * Updates a dead-letter entry after a failed replay attempt.
 */
export function markDeadLetterReplayed(
  idOrDeliveryId: string,
  errorDetail: string,
  attemptRecord?: DeliveryAttemptHistory,
): DeadLetterEntry | undefined {
  const entry = getDeadLetterEntry(idOrDeliveryId);
  if (!entry) return undefined;

  entry.replayCount += 1;
  entry.lastReplayedAt = new Date().toISOString();
  entry.lastError = errorDetail;
  if (attemptRecord) {
    entry.history.push(attemptRecord);
  }

  deadLetterStore.set(entry.id, entry);
  return entry;
}
