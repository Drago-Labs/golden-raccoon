import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { verifyMessage } from "viem";
import { Keypair, Networks, Operation, Memo, MemoText, Account, TransactionBuilder, Transaction } from "@stellar/stellar-sdk";
import { jsonError } from "@/server/api/errors";
import { mintNonce, verifyAndConsumeNonce } from "./nonce";
import {
  createSession,
  getSession,
  touchSession,
  revokeSession,
} from "./session/registry";
import {
  extractDeviceBinding,
  validateDeviceBinding,
} from "./session/binding";
import {
  shouldRotateSession,
  rotateSession,
  validateSessionGeneration,
} from "./session/rotation";
import type { SessionRecord } from "./session/types";

/**
 * Server-controlled wallet session used by the alert APIs. Holds the
 * authenticated wallet in an HttpOnly cookie so request bodies/query
 * strings cannot override the wallet scope.
 *
 * Audit #38: the cookie is ONLY minted after the wallet proves
 * ownership of `walletAddress` via a server-issued signature challenge.
 * This module exposes challenge mint + verify helpers used by
 * `/api/wallet-session` POST and `/api/wallet-session/nonce` POST.
 */

export const WALLET_SESSION_COOKIE = "gr_wallet_session";
export const WALLET_CHALLENGE_COOKIE = "gr_wallet_challenge";
export const WALLET_SESSION_TTL_SECONDS = 60 * 60 * 12; // 12 hours
export const WALLET_CHALLENGE_TTL_SECONDS = 60 * 5; // 5 minutes
const SESSION_VERSION = "v2";
const CHALLENGE_VERSION = "v2";
const DEVELOPMENT_COOKIE_SECRET =
  "golden-raccoon-development-only-cookie-secret";

export type WalletFamily = "evm" | "stellar";

export interface WalletChallenge {
  /** Random 16-byte hex nonce — tied to the cookie so it cannot be reused. */
  nonce: string;
  family: WalletFamily;
  walletAddress: string;
  /** ISO 8601 issuance timestamp. */
  issuedAt: string;
  /** ISO 8601 expiry timestamp — server-side clock. */
  expiresAt: string;
  /**
   * EVM: textual EIP-191 personal_sign payload.
   * Stellar: base64 transaction XDR envelope that the wallet signs via
   * SEP-10 lite (zero-amount self-payment with the nonce as memo and
   * a `timebounds` window matching the cookie TTL).
   */
  challengeBody: string;
  /** Stellar: network passphrase the challenge was built for. */
  network: string;
}

export interface WalletChallengeClaim {
  walletAddress: string;
  family: WalletFamily;
  nonce: string;
  /** EVM: 0x-prefixed signature over the EIP-191 personal_sign payload. */
  signature?: string;
  /** Stellar: signed transaction envelope in base64 XDR. */
  signedTxXdr?: string;
  network?: string;
}

export interface WalletChallengeVerifyResult {
  ok: boolean;
  error?: string;
}

function normalizeWallet(input: string | null | undefined): string | undefined {
  if (!input) return undefined;
  const trimmed = input.trim();
  if (!trimmed.length) return undefined;

  // EVM wallets are 0x-prefixed hex; lowercasing is idempotent and
  // canonical. Stellar StrKey addresses are case-sensitive Base32, so
  // lowercasing them produces an invalid encoding — we must preserve
  // the address exactly as supplied.
  if (/^0[xX]/.test(trimmed)) return trimmed.toLowerCase();

  return trimmed;
}

const SESSION_VERSION_V2 = "v2";
const SESSION_VERSION_V3 = "v3";

function computeWalletHmac(wallet: string): string {
  const secret = process.env.SESSION_SECRET || "golden-raccoon-session-hmac-secret-key-32b";
  return crypto.createHmac("sha256", secret).update(wallet).digest("hex").slice(0, 16);
}

function computeWalletV3Hmac(wallet: string, sessionId: string, generation: number): string {
  const secret = process.env.SESSION_SECRET || "golden-raccoon-session-hmac-secret-key-32b";
  const payload = `${wallet}:${sessionId}:${generation}`;
  return crypto.createHmac("sha256", secret).update(payload).digest("hex").slice(0, 16);
}

function walletHmacMatches(wallet: string, signature: string): boolean {
  const expected = Buffer.from(computeWalletHmac(wallet));
  const observed = Buffer.from(signature);
  return expected.length === observed.length &&
    crypto.timingSafeEqual(expected, observed);
}

function walletV3HmacMatches(
  wallet: string,
  sessionId: string,
  generation: number,
  signature: string
): boolean {
  const expected = Buffer.from(computeWalletV3Hmac(wallet, sessionId, generation));
  const observed = Buffer.from(signature);
  return expected.length === observed.length &&
    crypto.timingSafeEqual(expected, observed);
}

/**
 * Builds a signed v3 session cookie value containing the wallet, unique session ID, and generation.
 *
 * @param wallet Canonical wallet address.
 * @param sessionId Unique session identifier.
 * @param generation Generation counter.
 * @returns Serialized signed v3 cookie string.
 */
export function encodeWalletV3Cookie(
  wallet: string,
  sessionId: string,
  generation: number
): string {
  const normalized = normalizeWallet(wallet) || wallet;
  const sig = computeWalletV3Hmac(normalized, sessionId, generation);
  return `${SESSION_VERSION_V3}:${normalized}:${sessionId}:${generation}:${sig}`;
}

/**
 * Builds a session cookie value. Supports v3 when sessionId is provided, and v2 legacy fallback.
 *
 * @param wallet Canonical wallet address.
 * @param options Optional session metadata.
 * @returns Serialized signed cookie string.
 */
export function encodeWalletCookie(
  wallet: string,
  options?: { sessionId?: string; generation?: number }
): string {
  if (options?.sessionId) {
    return encodeWalletV3Cookie(wallet, options.sessionId, options.generation ?? 1);
  }
  const normalized = normalizeWallet(wallet) || wallet;
  const sig = computeWalletHmac(normalized);
  return `${SESSION_VERSION_V2}:${normalized}:${sig}`;
}

export interface DecodedWalletSessionToken {
  version: "v2" | "v3";
  wallet: string;
  sessionId?: string;
  generation?: number;
}

/**
 * Decodes and cryptographically validates a raw session token string into structured session attributes.
 *
 * @param value The raw cookie token value.
 * @returns DecodedWalletSessionToken if signature is valid, or undefined.
 */
export function decodeWalletSessionToken(
  value: string | null | undefined
): DecodedWalletSessionToken | undefined {
  if (!value) return undefined;
  if (value.startsWith(`${SESSION_VERSION_V3}:`)) {
    const parts = value.split(":");
    if (parts.length !== 5) return undefined;
    const [, wallet, sessionId, genStr, signature] = parts;
    if (!wallet || !sessionId || !genStr || !signature) return undefined;
    const generation = parseInt(genStr, 10);
    if (!Number.isFinite(generation)) return undefined;
    if (!walletV3HmacMatches(wallet, sessionId, generation, signature)) return undefined;
    const normalized = normalizeWallet(wallet);
    if (!normalized) return undefined;
    return { version: "v3", wallet: normalized, sessionId, generation };
  }
  if (value.startsWith(`${SESSION_VERSION_V2}:`)) {
    const parts = value.split(":");
    if (parts.length !== 3) return undefined;
    const [, wallet, signature] = parts;
    if (!wallet || !signature) return undefined;
    if (!walletHmacMatches(wallet, signature)) return undefined;
    const normalized = normalizeWallet(wallet);
    if (!normalized) return undefined;
    return { version: "v2", wallet: normalized };
  }
  return undefined;
}

/**
 * Resolve the wallet carried by a session cookie, or undefined when absent or invalid.
 *
 * @param value The raw session cookie value.
 * @returns The authenticated wallet address if valid, or undefined.
 */
export function decodeWalletCookie(value: string | null | undefined): string | undefined {
  const token = decodeWalletSessionToken(value);
  return token?.wallet;
}

function rawHex(byteLength: number): string {
  return crypto.randomBytes(byteLength).toString("hex");
}

// Stellar MEMO_TEXT accepts at most 28 UTF-8 bytes. We round the nonce
// to 14 raw bytes (28 hex chars) so it fits inside the envelope memo.
const STELLAR_MEMO_NONCE_BYTES = 14;
const NONCE_BYTE_LENGTH = 16;

function cookieSecret() {
  return process.env.WALLET_SESSION_COOKIE_SECRET?.trim() ||
    DEVELOPMENT_COOKIE_SECRET;
}

function signCookiePayload(payload: string) {
  return crypto
    .createHmac("sha256", cookieSecret())
    .update(payload)
    .digest("base64url");
}

function verifyCookiePayload(payload: string, signature: string) {
  const expected = Buffer.from(signCookiePayload(payload));
  const observed = Buffer.from(signature);
  return expected.length === observed.length &&
    crypto.timingSafeEqual(expected, observed);
}

function encodeChallengeCookie(challenge: WalletChallenge): string {
  const payload = Buffer.from(JSON.stringify(challenge), "utf8").toString("base64url");
  return `${CHALLENGE_VERSION}.${payload}.${signCookiePayload(payload)}`;
}

function decodeChallenge(value: string | null | undefined): WalletChallenge | undefined {
  if (!value) return undefined;
  const [version, payload, signature] = value.split(".");
  if (
    version !== CHALLENGE_VERSION ||
    !payload ||
    !signature ||
    !verifyCookiePayload(payload, signature)
  ) return undefined;

  try {
    const challenge = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as Partial<WalletChallenge>;
    const wallet = normalizeWallet(challenge.walletAddress);
    if (
      !wallet ||
      (challenge.family !== "evm" && challenge.family !== "stellar") ||
      !challenge.nonce ||
      !challenge.issuedAt ||
      !challenge.expiresAt ||
      !challenge.challengeBody ||
      typeof challenge.network !== "string"
    ) return undefined;
    return { ...challenge, walletAddress: wallet } as WalletChallenge;
  } catch {
    return undefined;
  }
}

/**
 * Decide whether the API deployment is allowed to mint session cookies.
 * Defaults to enabled in non-production; in production the operator must
 * opt-in explicitly via `ALLOW_WALLET_SESSION_COOKIE=1`.
 */
export function isWalletSessionCookieAllowed(): boolean {
  if (process.env.NODE_ENV === "production") {
    return (
      process.env.ALLOW_WALLET_SESSION_COOKIE === "1" &&
      (process.env.WALLET_SESSION_COOKIE_SECRET?.trim().length ?? 0) >= 32
    );
  }
  if (process.env.ALLOW_WALLET_SESSION_COOKIE === "1") return true;
  return true;
}

/**
 * Authoritative server-side wallet resolution for the alert APIs. Reads
 * the HttpOnly cookie; rejects any user-supplied wallet address that does
 * not match the session wallet. Returns either `{ wallet }` for downstream
 * handlers, or `{ response }` which is a 401/403 NextResponse.
 */
export type WalletSessionResolution =
  | { wallet: string; session?: SessionRecord; isOverlap?: boolean; response?: undefined }
  | { wallet?: undefined; session?: undefined; isOverlap?: undefined; response: NextResponse };

function forbidden(reason: "missing" | "mismatch"): NextResponse {
  if (reason === "missing") {
    return jsonError(
      {
        code: "auth_error",
        message: "Connect your wallet on the client before calling alert APIs.",
        status: 401,
        recoveryAction: "reconnect",
        details: { reason: "wallet_session_required" },
      },
      {
        legacy: {
          error: "wallet_session_required",
          detail: "Connect your wallet on the client before calling alert APIs.",
        },
      }
    );
  }

  return jsonError(
    {
      code: "auth_error",
      message: "The supplied wallet does not match the active wallet session.",
      status: 403,
      recoveryAction: "reconnect",
      details: { reason: "wallet_session_mismatch" },
    },
    {
      legacy: {
        error: "wallet_session_mismatch",
        detail: "The supplied wallet does not match the active wallet session.",
      },
    }
  );
}

/**
 * Extracts and decodes the structured wallet session token from the cookie header.
 *
 * @param request The incoming Request or NextRequest.
 * @returns DecodedWalletSessionToken if valid, or undefined.
 */
export function readWalletSessionToken(request: Request | NextRequest): DecodedWalletSessionToken | undefined {
  const header = request.headers.get("cookie") ?? "";

  for (const piece of header.split(";")) {
    const [rawKey, ...rest] = piece.split("=");
    if (rawKey && rawKey.trim() === WALLET_SESSION_COOKIE) {
      return decodeWalletSessionToken(rest.join("=").trim());
    }
  }

  return undefined;
}

/**
 * Resolves the authenticated wallet address from the request cookie.
 *
 * @param request The incoming Request or NextRequest.
 * @returns The authenticated wallet address string if present and valid, or undefined.
 */
export function readWalletSessionCookie(request: Request | NextRequest): string | undefined {
  const token = readWalletSessionToken(request);
  return token?.wallet;
}

/**
 * Resolves and cryptographically enforces the active wallet session, device binding, and generation lifecycle.
 *
 * @param request The incoming Request or NextRequest.
 * @param options Optional configuration including supplied wallet check.
 * @returns WalletSessionResolution containing authenticated wallet and session or a terminal error response.
 */
export function resolveWalletSession(
  request: Request | NextRequest,
  options: { suppliedWallet?: string | null } = {},
): WalletSessionResolution {
  const token = readWalletSessionToken(request);

  if (!token) return { response: forbidden("missing") };
  if (options.suppliedWallet && normalizeWallet(options.suppliedWallet) !== token.wallet) {
    return { response: forbidden("mismatch") };
  }

  if (token.version === "v3" && token.sessionId) {
    const session = getSession(token.sessionId);
    if (!session) {
      return {
        response: jsonError(
          {
            code: "auth_error",
            message: "Wallet session not found in registry.",
            status: 401,
            recoveryAction: "reconnect",
            details: { reason: "session_not_found" },
          },
          { legacy: { error: "session_not_found", detail: "Wallet session not found in registry." } }
        ),
      };
    }

    if (session.status === "revoked" || session.revokedAt !== undefined) {
      return {
        response: jsonError(
          {
            code: "session_revoked",
            message: "Wallet session has been revoked.",
            status: 401,
            recoveryAction: "reconnect",
            details: { reason: "session_revoked" },
          },
          { legacy: { error: "session_revoked", detail: "Wallet session has been revoked." } }
        ),
      };
    }

    if (session.status === "expired" || Date.now() > session.expiresAt) {
      return {
        response: jsonError(
          {
            code: "session_expired",
            message: "Wallet session has expired.",
            status: 401,
            recoveryAction: "reconnect",
            details: { reason: "session_expired" },
          },
          { legacy: { error: "session_expired", detail: "Wallet session has expired." } }
        ),
      };
    }

    const currentBinding = extractDeviceBinding(request);
    if (!validateDeviceBinding(session.deviceBindingHash, currentBinding.bindingHash)) {
      return {
        response: jsonError(
          {
            code: "device_binding_mismatch",
            message: "A session replayed from a different device binding is refused.",
            status: 401,
            recoveryAction: "reconnect",
            details: { reason: "device_binding_mismatch" },
          },
          {
            legacy: {
              error: "device_binding_mismatch",
              detail: "A session replayed from a different device binding is refused.",
            },
          }
        ),
      };
    }

    const genCheck = validateSessionGeneration(session, token.generation ?? 1, Date.now());
    if (!genCheck.valid) {
      if (genCheck.reason === "superseded_expired") {
        return {
          response: jsonError(
            {
              code: "session_superseded",
              message: "This session generation has been superseded and the overlap window has expired.",
              status: 401,
              recoveryAction: "reconnect",
              details: { reason: "session_superseded" },
            },
            {
              legacy: {
                error: "session_superseded",
                detail: "This session generation has been superseded and the overlap window has expired.",
              },
            }
          ),
        };
      }
      return {
        response: jsonError(
          {
            code: "auth_error",
            message: `Session generation invalid: ${genCheck.reason}.`,
            status: 401,
            recoveryAction: "reconnect",
            details: { reason: genCheck.reason },
          },
          { legacy: { error: genCheck.reason, detail: `Session generation invalid: ${genCheck.reason}.` } }
        ),
      };
    }

    touchSession(session.sessionId);
    return { wallet: token.wallet, session, isOverlap: genCheck.isOverlap };
  }

  return { wallet: token.wallet };
}

/**
 * Convenience for handlers that read a walletAddress query/body field
 * alongside a session. Returns a wallet if everything matches, else a
 * 403 response. Useful when the client still sends the wallet for
 * transparency but the server remains authoritative.
 */
export function resolveWalletSessionFromSupplied(
  request: Request | NextRequest,
  suppliedWallet: string | null | undefined,
): WalletSessionResolution {
  return resolveWalletSession(request, { suppliedWallet });
}

/**
 * Applies an authenticated wallet session cookie to an outgoing NextResponse.
 *
 * @param response The target NextResponse.
 * @param wallet The authenticated wallet address.
 * @param options Optional session metadata (sessionId and generation).
 * @returns The modified NextResponse.
 */
export function applyWalletCookie(
  response: NextResponse,
  wallet: string,
  options?: { sessionId?: string; generation?: number }
) {
  const cookieValue = options?.sessionId
    ? encodeWalletV3Cookie(wallet, options.sessionId, options.generation ?? 1)
    : encodeWalletCookie(wallet);

  response.cookies.set({
    name: WALLET_SESSION_COOKIE,
    value: cookieValue,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: WALLET_SESSION_TTL_SECONDS,
  });

  return response;
}

/**
 * Clears the authenticated wallet session cookie and optionally revokes the session in the registry.
 *
 * @param response The target NextResponse.
 * @param sessionId Optional session identifier to mark revoked.
 * @returns The modified NextResponse.
 */
export function clearWalletCookie(response: NextResponse, sessionId?: string) {
  if (sessionId) {
    revokeSession(sessionId, "user_cleared_cookie");
  }
  response.cookies.set({
    name: WALLET_SESSION_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });

  return response;
}

// ---------------- Signature Challenge ----------------

const STELLAR_FALLBACK_PASSPHRASE = Networks.TESTNET;

/**
 * Issue a wallet-ownership challenge. The returned challenge ships to
 * the client (sans `challengeBody` for non-EVM callers, which we
 * separately encode) AND is bound to an HttpOnly cookie carrying the
 * nonce + family + walletAddress + issuedAt + expiresAt. Subsequent
 * claims must present a valid signature for the same nonce and family.
 */
export function mintWalletChallenge(input: {
  walletAddress: string;
  family: WalletFamily;
  network?: string;
}): WalletChallenge {
  const normalizedWallet = normalizeWallet(input.walletAddress);
  if (!normalizedWallet) throw new Error("wallet_address_required");
  // EVM nonces are arbitrary-length hex (16 raw bytes = 32 hex chars).
  // Stellar MEMO_TEXT is capped at 28 UTF-8 bytes, so we shrink the
  // nonce to 14 raw bytes (28 hex chars) on that path to stay inside
  // the envelope memo.
  const nonce = input.family === "stellar" ? rawHex(STELLAR_MEMO_NONCE_BYTES) : rawHex(NONCE_BYTE_LENGTH);
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + WALLET_CHALLENGE_TTL_SECONDS * 1000);
  const network = input.network ?? (input.family === "stellar" ? STELLAR_FALLBACK_PASSPHRASE : "");

  mintNonce({
    walletAddress: normalizedWallet,
    family: input.family,
    network,
    ttlSeconds: WALLET_CHALLENGE_TTL_SECONDS,
    customNonce: nonce,
  });

  let challengeBody: string;
  if (input.family === "evm") {
    challengeBody = [
      "Sign in to Golden Raccoon",
      "",
      `Wallet: ${normalizedWallet}`,
      `Nonce: ${nonce}`,
      `Issued At: ${issuedAt.toISOString()}`,
      `Expires At: ${expiresAt.toISOString()}`,
    ].join("\n");
  } else {
    const source = new Account(normalizedWallet, "0");
    const builder = new TransactionBuilder(source, {
      fee: "100",
      networkPassphrase: network,
      memo: new Memo(MemoText, nonce),
      timebounds: {
        minTime: Math.floor(issuedAt.getTime() / 1000),
        maxTime: Math.floor(expiresAt.getTime() / 1000),
      },
    });
    builder.addOperation(
      Operation.manageData({
        name: "auth",
        value: "Golden Raccoon wallet auth",
      }),
    );
    const tx = builder.build();
    challengeBody = tx.toEnvelope().toXDR("base64");
  }

  return {
    nonce,
    family: input.family,
    walletAddress: normalizedWallet,
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    challengeBody,
    network,
  };
}

/**
 * Verify a claimed challenge signature against the supplied public
 * address. Returns `{ ok: false, error: <code> }` on any mismatch so the
 * caller can surface a typed response without leaking signature bytes.
 *
 * Returns a Promise because viem's `verifyMessage` is itself async;
 * callers must `await` the result.
 */
export async function verifyWalletChallenge(input: {
  challenge: WalletChallenge;
  walletAddress: string;
  family: WalletFamily;
  signature?: string;
  signedTxXdr?: string;
  network?: string;
}): Promise<WalletChallengeVerifyResult> {
  const claimWallet = normalizeWallet(input.walletAddress);
  if (!claimWallet) return { ok: false, error: "wallet_missing" };
  if (claimWallet !== input.challenge.walletAddress) return { ok: false, error: "wallet_mismatch" };
  if (input.challenge.family !== input.family) return { ok: false, error: "family_mismatch" };

  const expiresAt = Date.parse(input.challenge.expiresAt);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) {
    return { ok: false, error: "challenge_expired" };
  }

  if (input.family === "evm") {
    if (!input.signature) return { ok: false, error: "signature_missing" };
    try {
      const valid = await verifyMessage({
        address: claimWallet as `0x${string}`,
        message: input.challenge.challengeBody,
        signature: input.signature as `0x${string}`,
      });

      if (!valid) {
        return { ok: false, error: "evm_signature_invalid" };
      }

      const nonceResult = verifyAndConsumeNonce({
        nonce: input.challenge.nonce,
        walletAddress: claimWallet,
        family: input.family,
        consume: true,
      });

      if (!nonceResult.ok) {
        if (nonceResult.status === "already_used") {
          return { ok: false, error: "nonce_already_used" };
        }
        if (nonceResult.status === "expired") {
          return { ok: false, error: "nonce_expired" };
        }
        if (nonceResult.status === "address_mismatch") {
          return { ok: false, error: "nonce_address_mismatch" };
        }
        return { ok: false, error: "invalid_nonce" };
      }

      return { ok: true };
    } catch (error) {
      return { ok: false, error: `evm_verify_failed:${errorMessage(error)}` };
    }
  }

  if (!input.signedTxXdr) return { ok: false, error: "signed_tx_missing" };
  const network = input.network || input.challenge.network || STELLAR_FALLBACK_PASSPHRASE;

  try {
    const parsed = TransactionBuilder.fromXDR(input.signedTxXdr, network);
    if (!(parsed instanceof Transaction)) {
      return { ok: false, error: "stellar_fee_bump_unsupported" };
    }
    const tx = parsed;

    const memo = tx.memo;
    if (!memo || memo.type !== MemoText) return { ok: false, error: "stellar_memo_wrong_type" };
    const memoValue =
      typeof memo.value === "string"
        ? memo.value
        : memo.value instanceof Uint8Array || Buffer.isBuffer(memo.value)
          ? Buffer.from(memo.value).toString("utf-8")
          : "";
    if (memoValue !== input.challenge.nonce) return { ok: false, error: "stellar_memo_mismatch" };

    if (tx.timeBounds && typeof tx.timeBounds.maxTime === "number" && tx.timeBounds.maxTime < Math.floor(Date.now() / 1000)) {
      return { ok: false, error: "stellar_timebound_expired" };
    }

    const txHash = tx.hash();
    const keyPair = Keypair.fromPublicKey(claimWallet);
    const decorations = tx.signatures;
    const valid = decorations.some((sig) => {
      try {
        const sigObj = sig as unknown as {
          signature?: (() => Uint8Array | Buffer) | { value?: Uint8Array | Buffer } | Uint8Array | Buffer;
        };
        const rawSig = typeof sigObj.signature === "function"
          ? sigObj.signature()
          : (sigObj.signature && typeof sigObj.signature === "object" && "value" in sigObj.signature)
            ? sigObj.signature.value
            : sigObj.signature;
        if (!rawSig || (typeof rawSig === "object" && !("length" in rawSig))) return false;
        return keyPair.verify(txHash, Buffer.from(rawSig as Uint8Array | Buffer));
      } catch {
        return false;
      }
    });

    if (!valid) {
      return { ok: false, error: "stellar_signature_invalid" };
    }

    const nonceResult = verifyAndConsumeNonce({
      nonce: input.challenge.nonce,
      walletAddress: claimWallet,
      family: input.family,
      consume: true,
    });

    if (!nonceResult.ok) {
      if (nonceResult.status === "already_used") {
        return { ok: false, error: "nonce_already_used" };
      }
      if (nonceResult.status === "expired") {
        return { ok: false, error: "nonce_expired" };
      }
      if (nonceResult.status === "address_mismatch") {
        return { ok: false, error: "nonce_address_mismatch" };
      }
      return { ok: false, error: "invalid_nonce" };
    }

    return { ok: true };
  } catch (error) {
    return { ok: false, error: `stellar_parse_failed:${errorMessage(error)}` };
  }
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export function readChallengeCookie(request: Request | NextRequest): WalletChallenge | undefined {
  const header = request.headers.get("cookie") ?? "";

  for (const piece of header.split(";")) {
    const [rawKey, ...rest] = piece.split("=");

    if (rawKey && rawKey.trim() === WALLET_CHALLENGE_COOKIE) {
      return decodeChallenge(rest.join("="));
    }
  }

  return undefined;
}

export function applyChallengeCookie(response: NextResponse, challenge: WalletChallenge) {
  response.cookies.set({
    name: WALLET_CHALLENGE_COOKIE,
    value: encodeChallengeCookie(challenge),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: WALLET_CHALLENGE_TTL_SECONDS,
  });

  return response;
}

export function clearChallengeCookie(response: NextResponse) {
  response.cookies.set({
    name: WALLET_CHALLENGE_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });

  return response;
}
