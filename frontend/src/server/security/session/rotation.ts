import { getSession } from "./registry";
import type { SessionRecord } from "./types";

export const DEFAULT_ROTATION_INTERVAL_MS = 60 * 60 * 1000;
export const DEFAULT_OVERLAP_WINDOW_MS = 60 * 1000;

export interface GenerationValidationResult {
  /** Whether the presented generation is allowed to execute requests. */
  valid: boolean;
  /** Whether the generation was accepted under the bounded overlap grace window. */
  isOverlap: boolean;
  /** Detailed reason classification for telemetry and audit logs. */
  reason:
    | "current"
    | "overlap"
    | "superseded_expired"
    | "invalid_generation"
    | "revoked"
    | "expired";
}

export interface RotationResult {
  /** The updated session record. */
  session: SessionRecord;
  /** The generation sequence number prior to rotation. */
  previousGeneration: number;
  /** The new active generation sequence number. */
  newGeneration: number;
}

/**
 * Determines whether an active session has reached its scheduled rotation threshold.
 *
 * @param session The active session record.
 * @param now Current timestamp in milliseconds.
 * @param intervalMs Rotation interval duration in milliseconds.
 * @returns True if the session should be rotated.
 */
export function shouldRotateSession(
  session: SessionRecord,
  now = Date.now(),
  intervalMs = DEFAULT_ROTATION_INTERVAL_MS
): boolean {
  if (session.status !== "active") return false;
  return now >= session.createdAt + session.generation * intervalMs;
}

/**
 * Rotates an active session to the next generation while maintaining a bounded overlap grace window for the prior generation.
 *
 * @param sessionId The unique session identifier.
 * @param overlapWindowMs The duration in milliseconds that the previous generation remains acceptable.
 * @param now Current timestamp in milliseconds.
 * @returns RotationResult on success, or null if the session cannot be rotated.
 */
export function rotateSession(
  sessionId: string,
  overlapWindowMs = DEFAULT_OVERLAP_WINDOW_MS,
  now = Date.now()
): RotationResult | null {
  const session = getSession(sessionId);
  if (!session || session.status !== "active") {
    return null;
  }

  const previousGeneration = session.generation;
  session.generation += 1;
  session.supersededAt = now;
  session.supersededOverlapUntil = now + overlapWindowMs;

  return {
    session,
    previousGeneration,
    newGeneration: session.generation,
  };
}

/**
 * Evaluates whether a presented generation counter is valid, within overlap grace, or superseded and expired.
 *
 * @param session The target session record.
 * @param presentedGeneration The generation counter decoded from the client's request token.
 * @param now Current timestamp in milliseconds.
 * @returns GenerationValidationResult.
 */
export function validateSessionGeneration(
  session: SessionRecord,
  presentedGeneration: number,
  now = Date.now()
): GenerationValidationResult {
  if (session.status === "revoked") {
    return { valid: false, isOverlap: false, reason: "revoked" };
  }

  if (session.status === "expired" || now > session.expiresAt) {
    return { valid: false, isOverlap: false, reason: "expired" };
  }

  if (presentedGeneration === session.generation) {
    return { valid: true, isOverlap: false, reason: "current" };
  }

  if (presentedGeneration === session.generation - 1) {
    if (session.supersededOverlapUntil && now <= session.supersededOverlapUntil) {
      return { valid: true, isOverlap: true, reason: "overlap" };
    }
    return { valid: false, isOverlap: false, reason: "superseded_expired" };
  }

  return { valid: false, isOverlap: false, reason: "invalid_generation" };
}
