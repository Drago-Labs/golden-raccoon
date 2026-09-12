import {
  findSessionByIdOrHash,
  revokeAllSessionsForWallet,
  revokeSession,
} from "./registry";
import type { SessionRecord } from "./types";

export interface RevocationSummary {
  success: boolean;
  targetIdOrHash: string;
  revokedAt: string;
  reason: string;
}

export interface WalletRevocationSummary {
  walletAddress: string;
  revokedCount: number;
  revokedAt: string;
  reason: string;
}

/**
 * Revokes a session and returns a structured audit confirmation.
 *
 * @param sessionIdOrHash The session ID or session hash to revoke.
 * @param reason Audit rationale for the revocation action.
 * @returns RevocationSummary.
 */
export function terminateSession(
  sessionIdOrHash: string,
  reason = "user_revoked"
): RevocationSummary {
  const success = revokeSession(sessionIdOrHash, reason);
  return {
    success,
    targetIdOrHash: sessionIdOrHash,
    revokedAt: new Date().toISOString(),
    reason,
  };
}

/**
 * Revokes all sessions belonging to a specific wallet address and returns an audit confirmation.
 *
 * @param walletAddress The target wallet address.
 * @param reason Audit rationale for terminating all sessions.
 * @returns WalletRevocationSummary.
 */
export function terminateAllWalletSessions(
  walletAddress: string,
  reason = "all_sessions_revoked"
): WalletRevocationSummary {
  const count = revokeAllSessionsForWallet(walletAddress, reason);
  return {
    walletAddress,
    revokedCount: count,
    revokedAt: new Date().toISOString(),
    reason,
  };
}

/**
 * Verifies that a session has not been explicitly revoked.
 *
 * @param session The session record to inspect.
 * @returns True if the session is not revoked.
 */
export function isSessionActive(session: SessionRecord): boolean {
  return session.status !== "revoked" && session.revokedAt === undefined;
}

export { findSessionByIdOrHash, revokeAllSessionsForWallet, revokeSession };
