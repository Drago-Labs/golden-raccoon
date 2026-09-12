import { NextRequest, NextResponse } from "next/server";
import {
  applyWalletCookie,
  resolveWalletSession,
} from "@/server/security/walletSession";
import { rotateSession } from "@/server/security/session";
import { checkRateLimitProfile } from "@/server/security/rateLimit";
import { commonErrorCodes, jsonError } from "@/server/api/errors";

/**
 * Rotates the generation number for the authenticated wallet session.
 *
 * @param request The incoming NextRequest.
 * @returns JSON response with updated generation details and updated Set-Cookie header.
 */
export async function POST(request: NextRequest) {
  const rateLimited = checkRateLimitProfile(request, "alertRuleWrite");
  if (rateLimited) return rateLimited;

  const resolution = resolveWalletSession(request);
  if (resolution.response) return resolution.response;

  if (!resolution.session) {
    return jsonError(
      { code: commonErrorCodes.badRequest, message: "Active v3 session required for rotation.", status: 400 },
      { legacy: { error: "v3_session_required" } }
    );
  }

  const rotation = rotateSession(resolution.session.sessionId);
  if (!rotation) {
    return jsonError(
      { code: "session_revoked", message: "Session cannot be rotated.", status: 401 },
      { legacy: { error: "cannot_rotate_session" } }
    );
  }

  const response = NextResponse.json({
    ok: true,
    sessionId: rotation.session.sessionId,
    generation: rotation.newGeneration,
    expiresAt: new Date(rotation.session.expiresAt).toISOString(),
    overlapExpiresAt: rotation.session.overlapExpiresAt
      ? new Date(rotation.session.overlapExpiresAt).toISOString()
      : undefined,
  });

  applyWalletCookie(response, resolution.wallet, {
    sessionId: rotation.session.sessionId,
    generation: rotation.newGeneration,
  });

  return response;
}
