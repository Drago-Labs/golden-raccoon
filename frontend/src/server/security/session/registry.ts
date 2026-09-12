import crypto from "crypto";
import type {
  CreateSessionParams,
  SanitizedSessionRecord,
  SessionRecord,
} from "./types";

type RegistryGlobal = typeof globalThis & {
  __goldenRaccoonWalletSessions?: Map<string, SessionRecord>;
};

function getSessionMap(): Map<string, SessionRecord> {
  const store = globalThis as RegistryGlobal;
  if (!store.__goldenRaccoonWalletSessions) {
    store.__goldenRaccoonWalletSessions = new Map<string, SessionRecord>();
  }
  return store.__goldenRaccoonWalletSessions;
}

function normalizeWallet(address: string): string {
  const trimmed = address.trim();
  return trimmed.startsWith("0x") ? trimmed.toLowerCase() : trimmed;
}

function addressesMatch(a: string, b: string): boolean {
  return normalizeWallet(a) === normalizeWallet(b);
}

/**
 * Computes a SHA-256 hash of a session identifier for safe reference in URLs and client state.
 *
 * @param sessionId The raw session identifier.
 * @returns Hex-encoded SHA-256 hash string.
 */
export function hashSessionId(sessionId: string): string {
  return crypto.createHash("sha256").update(sessionId).digest("hex");
}

/**
 * Formats an opaque hint of a session identifier for display in user interfaces.
 *
 * @param sessionId The raw session identifier.
 * @returns Truncated session hint string.
 */
export function formatSessionIdHint(sessionId: string): string {
  if (!sessionId) return "unknown";
  return `${sessionId.slice(0, 8)}…`;
}

/**
 * Mints and records a new authenticated session bound to a wallet address and device binding hash.
 *
 * @param params Parameters required to construct the session record.
 * @returns The newly created active SessionRecord.
 */
export function createSession(params: CreateSessionParams): SessionRecord {
  const sessionId = params.customSessionId ?? crypto.randomUUID();
  const now = Date.now();
  const ttlMs = (params.ttlSeconds ?? 43200) * 1000;
  const canonicalWallet = normalizeWallet(params.walletAddress);

  const session: SessionRecord = {
    sessionId,
    walletAddress: canonicalWallet,
    chainFamily: params.chainFamily,
    network: params.network ?? null,
    deviceBindingHash: params.deviceBindingHash,
    deviceHint: params.deviceHint,
    generation: 1,
    createdAt: now,
    lastUsedAt: now,
    expiresAt: now + ttlMs,
    status: "active",
  };

  getSessionMap().set(sessionId, session);
  return session;
}

/**
 * Retrieves a session record by its raw unique identifier.
 *
 * @param sessionId The session identifier to look up.
 * @returns The SessionRecord if found, or undefined.
 */
export function getSession(sessionId: string): SessionRecord | undefined {
  return getSessionMap().get(sessionId);
}

/**
 * Locates a session record by either its raw identifier or its SHA-256 hash.
 *
 * @param idOrHash The raw session ID or SHA-256 session hash.
 * @returns The matching SessionRecord if found, or undefined.
 */
export function findSessionByIdOrHash(idOrHash: string): SessionRecord | undefined {
  const map = getSessionMap();
  const direct = map.get(idOrHash);
  if (direct) return direct;

  for (const session of map.values()) {
    if (hashSessionId(session.sessionId) === idOrHash) {
      return session;
    }
  }
  return undefined;
}

/**
 * Updates the last activity timestamp for an active session.
 *
 * @param sessionId The session identifier.
 * @param now Optional timestamp in milliseconds.
 */
export function touchSession(sessionId: string, now = Date.now()): void {
  const session = getSessionMap().get(sessionId);
  if (session && session.status === "active") {
    session.lastUsedAt = now;
  }
}

/**
 * Immediately revokes an individual session record.
 *
 * @param sessionId The session identifier or session hash to revoke.
 * @param reason Audit reason for the revocation.
 * @returns True if a matching session was revoked.
 */
export function revokeSession(sessionId: string, reason = "user_revoked"): boolean {
  const session = findSessionByIdOrHash(sessionId);
  if (!session) return false;
  if (session.status === "revoked") return true;

  session.status = "revoked";
  session.revokedAt = Date.now();
  session.revocationReason = reason;
  return true;
}

/**
 * Immediately revokes all active and superseded sessions belonging to a specific wallet address.
 *
 * @param walletAddress The target wallet address.
 * @param reason Audit reason for terminating all sessions.
 * @returns The number of sessions that were transitioned to revoked status.
 */
export function revokeAllSessionsForWallet(
  walletAddress: string,
  reason = "all_revoked"
): number {
  const map = getSessionMap();
  let revokedCount = 0;
  const now = Date.now();

  for (const session of map.values()) {
    if (addressesMatch(session.walletAddress, walletAddress)) {
      if (session.status !== "revoked") {
        session.status = "revoked";
        session.revokedAt = now;
        session.revocationReason = reason;
        revokedCount++;
      }
    }
  }

  return revokedCount;
}

/**
 * Produces a sanitized, privacy-preserving list of sessions for a wallet address suitable for client display.
 *
 * @param walletAddress The target wallet address.
 * @param currentSessionId Optional current session identifier to mark isCurrent.
 * @returns Array of SanitizedSessionRecord items sorted newest first.
 */
export function listSessionsForWallet(
  walletAddress: string,
  currentSessionId?: string
): SanitizedSessionRecord[] {
  const map = getSessionMap();
  const results: SanitizedSessionRecord[] = [];

  for (const session of map.values()) {
    if (addressesMatch(session.walletAddress, walletAddress)) {
      results.push({
        sessionIdHint: formatSessionIdHint(session.sessionId),
        sessionIdHash: hashSessionId(session.sessionId),
        deviceHint: session.deviceHint,
        generation: session.generation,
        createdAt: new Date(session.createdAt).toISOString(),
        lastUsedAt: new Date(session.lastUsedAt).toISOString(),
        expiresAt: new Date(session.expiresAt).toISOString(),
        isCurrent: currentSessionId ? session.sessionId === currentSessionId : false,
        status: session.status,
      });
    }
  }

  return results.sort((a, b) => new Date(b.lastUsedAt).getTime() - new Date(a.lastUsedAt).getTime());
}

/**
 * Retrieves sanitized session records for inclusion in wallet privacy portability exports.
 *
 * @param walletAddress The target wallet address.
 * @returns Array of sanitized session records.
 */
export function exportSessionsForWallet(walletAddress: string): SanitizedSessionRecord[] {
  return listSessionsForWallet(walletAddress);
}

/**
 * Erases and purges all session records for a wallet address during privacy erasure workflows.
 *
 * @param walletAddress The target wallet address to erase.
 * @returns The number of session records eliminated.
 */
export function eraseSessionsForWallet(walletAddress: string): number {
  const map = getSessionMap();
  let erasedCount = 0;

  for (const [id, session] of map.entries()) {
    if (addressesMatch(session.walletAddress, walletAddress)) {
      map.delete(id);
      erasedCount++;
    }
  }

  return erasedCount;
}

/**
 * Prunes expired or revoked sessions that have aged past the retention threshold.
 *
 * @param now Current timestamp in milliseconds.
 * @param retentionMs Retention window in milliseconds (defaults to 30 days).
 * @returns Number of sessions removed from the registry.
 */
export function pruneExpiredSessions(
  now = Date.now(),
  retentionMs = 30 * 24 * 60 * 60 * 1000
): number {
  const map = getSessionMap();
  let prunedCount = 0;

  for (const [id, session] of map.entries()) {
    const isExpired = now > session.expiresAt;
    const isRevokedOld = session.revokedAt ? now > session.revokedAt + retentionMs : false;
    const isExpiredOld = isExpired && now > session.expiresAt + retentionMs;

    if (isRevokedOld || isExpiredOld) {
      map.delete(id);
      prunedCount++;
    } else if (isExpired && session.status === "active") {
      session.status = "expired";
    }
  }

  return prunedCount;
}

/**
 * Clears the session registry. Intended strictly for test fixtures.
 */
export function resetSessionRegistry(): void {
  getSessionMap().clear();
}
