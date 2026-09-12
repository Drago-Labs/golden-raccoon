import crypto from "crypto";
import type {
  MintNonceOptions,
  NonceRecord,
  NonceVerificationResult,
  VerifyNonceOptions,
} from "./contract";

type NonceGlobal = typeof globalThis & {
  __goldenRaccoonNonceStore?: Map<string, NonceRecord>;
};

function getNonceMap(): Map<string, NonceRecord> {
  const store = globalThis as NonceGlobal;
  if (!store.__goldenRaccoonNonceStore) {
    store.__goldenRaccoonNonceStore = new Map<string, NonceRecord>();
  }
  return store.__goldenRaccoonNonceStore;
}

function normalizeWallet(address: string): string {
  const trimmed = address.trim();
  return trimmed.startsWith("0x") ? trimmed.toLowerCase() : trimmed;
}

function addressesMatch(a: string, b: string): boolean {
  return normalizeWallet(a) === normalizeWallet(b);
}

/**
 * Mints and records a cryptographically secure, single-use authentication nonce bound to an address and family.
 *
 * @param options Configuration for nonce minting including wallet address, family, and optional TTL.
 * @returns The minted NonceRecord.
 */
export function mintNonce(options: MintNonceOptions): NonceRecord {
  const nonce = options.customNonce ?? crypto.randomBytes(24).toString("hex");
  const now = Date.now();
  const ttlMs = (options.ttlSeconds ?? 300) * 1000;
  const canonicalWallet = normalizeWallet(options.walletAddress);

  const record: NonceRecord = {
    nonce,
    walletAddress: canonicalWallet,
    family: options.family,
    network: options.network ?? null,
    issuedAt: now,
    expiresAt: now + ttlMs,
  };

  getNonceMap().set(nonce, record);
  return record;
}

/**
 * Verifies and atomically consumes a nonce for a given wallet address and chain family.
 *
 * @param options Nonce string, claiming wallet address, chain family, and evaluation options.
 * @returns NonceVerificationResult stating whether verification succeeded or specific failure reason.
 */
export function verifyAndConsumeNonce(options: VerifyNonceOptions): NonceVerificationResult {
  const now = options.now ?? Date.now();
  const map = getNonceMap();
  const record = map.get(options.nonce);

  if (!record) {
    return {
      ok: false,
      status: "not_found",
      error: "Authentication challenge nonce not found or unrecognized.",
    };
  }

  if (record.usedAt !== undefined) {
    return {
      ok: false,
      status: "already_used",
      record,
      error: "Authentication challenge nonce has already been consumed.",
    };
  }

  if (now > record.expiresAt) {
    return {
      ok: false,
      status: "expired",
      record,
      error: "Authentication challenge nonce has expired.",
    };
  }

  if (!addressesMatch(record.walletAddress, options.walletAddress)) {
    return {
      ok: false,
      status: "address_mismatch",
      record,
      error: "Challenge nonce was issued for a different wallet address.",
    };
  }

  if (record.family !== options.family) {
    return {
      ok: false,
      status: "family_mismatch",
      record,
      error: `Challenge nonce was issued for chain family ${record.family}, not ${options.family}.`,
    };
  }

  if (options.consume !== false) {
    record.usedAt = now;
  }

  return {
    ok: true,
    status: "valid",
    record,
  };
}

/**
 * Retrieves a nonce record without consuming or mutating it.
 *
 * @param nonce The nonce identifier to look up.
 * @returns The NonceRecord if present, or undefined.
 */
export function peekNonce(nonce: string): NonceRecord | undefined {
  return getNonceMap().get(nonce);
}

/**
 * Purges expired and consumed nonces that have exceeded retention lifetime.
 *
 * @param now Optional timestamp reference in milliseconds.
 * @returns Number of purged records.
 */
export function pruneExpiredNonces(now = Date.now()): number {
  const map = getNonceMap();
  let prunedCount = 0;
  for (const [nonce, record] of map.entries()) {
    if (now > record.expiresAt + 60000 || (record.usedAt && now > record.usedAt + 60000)) {
      map.delete(nonce);
      prunedCount++;
    }
  }
  return prunedCount;
}

/**
 * Clears all nonces in memory. Intended for test environments.
 */
export function resetNonceStore(): void {
  getNonceMap().clear();
}
