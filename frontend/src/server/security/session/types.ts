import type { ApiErrorCode } from "@/server/api/errors";

export type SessionStatus = "active" | "superseded" | "revoked" | "expired";

export interface DeviceBindingInfo {
  /** Cryptographic SHA-256 hash representing the device binding attributes. */
  bindingHash: string;
  /** Non-identifying, safe device hint for UI display. */
  deviceHint: string;
}

export interface SessionRecord {
  /** Unique session identifier. */
  sessionId: string;
  /** Canonical wallet address the session belongs to. */
  walletAddress: string;
  /** Chain family of the session ("evm" | "stellar"). */
  chainFamily: "evm" | "stellar";
  /** Optional network identifier. */
  network?: string | null;
  /** SHA-256 hash of device binding attributes. */
  deviceBindingHash: string;
  /** Sanitized device hint for display. */
  deviceHint: string;
  /** Generation counter for scheduled rotation. */
  generation: number;
  /** Creation timestamp in milliseconds. */
  createdAt: number;
  /** Timestamp of most recent activity in milliseconds. */
  lastUsedAt: number;
  /** Hard session expiration timestamp in milliseconds. */
  expiresAt: number;
  /** Timestamp in milliseconds when this generation was superseded by a rotation. */
  supersededAt?: number;
  /** Overlap window expiration in milliseconds during which superseded generation remains acceptable. */
  supersededOverlapUntil?: number;
  /** Timestamp in milliseconds when the session was explicitly revoked. */
  revokedAt?: number;
  /** Reason why the session was revoked. */
  revocationReason?: string;
  /** Lifecycle status of the session. */
  status: SessionStatus;
}

export interface SanitizedSessionRecord {
  /** Opaque truncated identifier hint for display. */
  sessionIdHint: string;
  /** SHA-256 hash of the session identifier for targeted revocation calls. */
  sessionIdHash: string;
  /** Sanitized device hint. */
  deviceHint: string;
  /** Generation sequence number. */
  generation: number;
  /** ISO timestamp of session creation. */
  createdAt: string;
  /** ISO timestamp of last activity. */
  lastUsedAt: string;
  /** ISO timestamp of session expiration. */
  expiresAt: string;
  /** Whether this session record corresponds to the requesting caller. */
  isCurrent?: boolean;
  /** Current lifecycle status. */
  status: SessionStatus;
}

export interface SessionValidationResult {
  /** True only if session is active or within acceptable rotation overlap window and device binding matches. */
  ok: boolean;
  /** Detailed lifecycle status or failure reason. */
  status: SessionStatus | "device_binding_mismatch" | "not_found";
  /** The verified session record if found. */
  session?: SessionRecord;
  /** Canonical API error code when validation fails. */
  errorCode?: ApiErrorCode;
  /** Human-readable explanation when validation fails. */
  errorMessage?: string;
  /** Whether the generation was updated and caller response must set an updated cookie. */
  isOverlap?: boolean;
}

export interface CreateSessionParams {
  walletAddress: string;
  chainFamily: "evm" | "stellar";
  network?: string | null;
  deviceBindingHash: string;
  deviceHint: string;
  ttlSeconds?: number;
  customSessionId?: string;
}
