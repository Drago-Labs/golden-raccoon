import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * Server-controlled wallet session used by the alert APIs. Holds the
 * authenticated wallet in an HttpOnly cookie so request bodies/query
 * strings cannot override the wallet scope.
 *
 * NOTE: This is not cryptographic proof of ownership — it is a defensive
 * guard against the audit finding where the alerts/rules/observations/
 * deliveries APIs accepted an arbitrary user-supplied wallet address and
 * exposed or mutated other wallets' records. The cookie is only set when
 * the request originates from this app's own client-side wallet-session
 * endpoint, which is rate-limited and verified via a short TTL.
 */

export const WALLET_SESSION_COOKIE = "gr_wallet_session";
export const WALLET_SESSION_TTL_SECONDS = 60 * 60 * 12; // 12 hours
const SESSION_VERSION = "v1";

function normalizeWallet(input: string | null | undefined): string | undefined {
  const trimmed = input?.trim().toLowerCase();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Build the cookie value. We attach a version prefix so we can rotate
 * the storage layer without breaking in-flight sessions.
 */
export function encodeWalletCookie(wallet: string): string {
  return `${SESSION_VERSION}:${wallet}`;
}

export function decodeWalletCookie(value: string | null | undefined): string | undefined {
  if (!value || !value.startsWith(`${SESSION_VERSION}:`)) return undefined;
  return normalizeWallet(value.slice(SESSION_VERSION.length + 1));
}

/**
 * Decide whether the API deployment is allowed to mint session cookies.
 * Defaults to enabled in non-production; in production the operator must
 * opt-in explicitly via `ALLOW_WALLET_SESSION_COOKIE=1`.
 */
export function isWalletSessionCookieAllowed(): boolean {
  if (process.env.ALLOW_WALLET_SESSION_COOKIE === "1") return true;
  return process.env.NODE_ENV !== "production";
}

/**
 * Authoritative server-side wallet resolution for the alert APIs. Reads
 * the HttpOnly cookie; rejects any user-supplied wallet address that does
 * not match the session wallet. Returns either `{ wallet }` for downstream
 * handlers, or `{ response }` which is a 401/403 NextResponse.
 */
export type WalletSessionResolution =
  | { wallet: string; response?: undefined }
  | { wallet?: undefined; response: NextResponse };

function forbidden(reason: "missing" | "mismatch"): NextResponse {
  if (reason === "missing") {
    return NextResponse.json(
      {
        error: "wallet_session_required",
        detail: "Connect your wallet on the client before calling alert APIs.",
      },
      { status: 401 },
    );
  }

  return NextResponse.json(
    {
      error: "wallet_session_mismatch",
      detail: "The supplied wallet does not match the active wallet session.",
    },
    { status: 403 },
  );
}

export function readWalletSessionCookie(request: Request | NextRequest): string | undefined {
  // Some test runners construct bare fetch Request objects without the
  // `cookies` helper, so we read from the header directly.
  const header = request.headers.get("cookie") ?? "";

  for (const piece of header.split(";")) {
    const [rawKey, ...rest] = piece.split("=");
    if (rawKey && rawKey.trim() === WALLET_SESSION_COOKIE) {
      return decodeWalletCookie(rest.join("="));
    }
  }

  return undefined;
}

export function resolveWalletSession(
  request: Request | NextRequest,
  options: { suppliedWallet?: string | null } = {},
): WalletSessionResolution {
  const sessionWallet = readWalletSessionCookie(request);

  if (!sessionWallet) return { response: forbidden("missing") };
  if (options.suppliedWallet && normalizeWallet(options.suppliedWallet) !== sessionWallet) {
    return { response: forbidden("mismatch") };
  }

  return { wallet: sessionWallet };
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
 * Apply a wallet cookie to a NextResponse.
 */
export function applyWalletCookie(response: NextResponse, wallet: string) {
  response.cookies.set({
    name: WALLET_SESSION_COOKIE,
    value: encodeWalletCookie(wallet),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: WALLET_SESSION_TTL_SECONDS,
  });

  return response;
}

export function clearWalletCookie(response: NextResponse) {
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
