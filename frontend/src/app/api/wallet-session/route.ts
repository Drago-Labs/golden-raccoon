import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  applyWalletCookie,
  clearChallengeCookie,
  clearWalletCookie,
  isWalletSessionCookieAllowed,
  readChallengeCookie,
  readWalletSessionToken,
  verifyWalletChallenge,
  WALLET_SESSION_TTL_SECONDS,
} from "@/server/security/walletSession";
import {
  createSession,
  getSession,
  revokeSession,
  extractDeviceBinding,
} from "@/server/security/session";
import { checkRateLimitProfile } from "@/server/security/rateLimit";
import { commonErrorCodes, jsonError } from "@/server/api/errors";

const claimSchema = z.object({
  walletAddress: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^0x[0-9a-fA-F]{6,}$|^G[A-Z2-7]{20,}$/, "Wallet does not match a known format."),
  family: z.enum(["evm", "stellar"]),
  nonce: z.string().trim().min(1).max(96),
  signature: z.string().trim().min(1).max(4096).optional(),
  signedTxXdr: z.string().trim().min(1).max(8192).optional(),
  network: z.string().trim().min(1).max(120).optional(),
});

function notConfigured() {
  const detail =
    "Set ALLOW_WALLET_SESSION_COOKIE=1 and a random WALLET_SESSION_COOKIE_SECRET of at least 32 characters to enable signed wallet sessions.";

  return jsonError(
    { code: "wallet_session_disabled", message: detail, status: 503 },
    { legacy: { error: "wallet_session_disabled", detail } },
  );
}

export async function POST(request: NextRequest) {
  const rateLimited = checkRateLimitProfile(request, "alertRuleWrite");
  if (rateLimited) return rateLimited;

  if (!isWalletSessionCookieAllowed()) return notConfigured();

  const challenge = readChallengeCookie(request);
  if (!challenge) {
    const detail = "Request /api/wallet-session/nonce first to receive a wallet-ownership challenge.";

    return jsonError(
      { code: commonErrorCodes.unauthorized, message: detail, status: 401 },
      { legacy: { error: "challenge_required", detail } },
    );
  }

  const body = await request.json().catch(() => ({}));
  const parsed = claimSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(
      { code: commonErrorCodes.validationError, message: "Request validation failed.", status: 400, details: parsed.error.flatten() },
      { legacy: { error: parsed.error.flatten() } },
    );
  }

  const wallet = parsed.data.family === "evm" ? parsed.data.walletAddress.trim().toLowerCase() : parsed.data.walletAddress.trim();
  if (parsed.data.nonce !== challenge.nonce) {
    const response = jsonError(
      { code: commonErrorCodes.unauthorized, message: "Challenge nonce does not match.", status: 401 },
      { legacy: { error: "nonce_mismatch" } },
    );

    return clearChallengeCookie(response);
  }

  const result = await verifyWalletChallenge({
    challenge,
    walletAddress: wallet,
    family: parsed.data.family,
    signature: parsed.data.signature,
    signedTxXdr: parsed.data.signedTxXdr,
    network: parsed.data.network,
  });

  if (!result.ok) {
    const response = jsonError(
      { code: commonErrorCodes.unauthorized, message: result.error ?? "Signature verification failed.", status: 401, details: { reason: result.error } },
      { legacy: { error: "signature_invalid", detail: result.error } },
    );

    return clearChallengeCookie(response);
  }

  const binding = extractDeviceBinding(request);
  const session = createSession({
    walletAddress: wallet,
    family: parsed.data.family,
    deviceBindingHash: binding.bindingHash,
    deviceHint: binding.deviceHint,
    ttlSeconds: WALLET_SESSION_TTL_SECONDS,
  });

  const response = NextResponse.json({
    walletAddress: wallet,
    sessionId: session.sessionId,
    generation: session.generation,
    createdAt: new Date(session.createdAt).toISOString(),
    expiresAt: new Date(session.expiresAt).toISOString(),
    deviceHint: session.deviceHint,
    ttlSeconds: WALLET_SESSION_TTL_SECONDS,
  });

  applyWalletCookie(response, wallet, { sessionId: session.sessionId, generation: session.generation });
  clearChallengeCookie(response);

  return response;
}

export function GET(request: NextRequest) {
  const token = readWalletSessionToken(request);

  if (!token) {
    return NextResponse.json({ walletAddress: null, session: null }, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  }

  if (token.version === "v3" && token.sessionId) {
    const session = getSession(token.sessionId);
    if (!session || session.status !== "active" || Date.now() > session.expiresAt) {
      return NextResponse.json({ walletAddress: null, session: null }, {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      });
    }

    return NextResponse.json(
      {
        walletAddress: session.walletAddress,
        sessionId: session.sessionId,
        generation: token.generation ?? session.generation,
        status: session.status,
        deviceHint: session.deviceHint,
        expiresAt: new Date(session.expiresAt).toISOString(),
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    { walletAddress: token.wallet },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}

export async function DELETE(request: NextRequest) {
  const rateLimited = checkRateLimitProfile(request, "alertRuleWrite");
  if (rateLimited) return rateLimited;

  const token = readWalletSessionToken(request);
  if (token?.sessionId) {
    revokeSession(token.sessionId, "logout");
  }

  const response = NextResponse.json({ walletAddress: null });
  clearWalletCookie(response, token?.sessionId);
  clearChallengeCookie(response);

  return response;
}
