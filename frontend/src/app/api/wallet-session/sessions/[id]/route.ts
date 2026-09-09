import { NextRequest, NextResponse } from "next/server";
import {
  clearWalletCookie,
  resolveWalletSession,
} from "@/server/security/walletSession";
import {
  getSession,
  revokeSession,
} from "@/server/security/session";
import { checkRateLimitProfile } from "@/server/security/rateLimit";
import { commonErrorCodes, jsonError } from "@/server/api/errors";

/**
 * Revokes a specific session belonging to the authenticated wallet.
 *
 * @param request The incoming NextRequest.
 * @param context The route segment context containing the target session id.
 * @returns JSON response confirming session revocation.
 */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  const rateLimited = checkRateLimitProfile(request, "alertRuleWrite");
  if (rateLimited) return rateLimited;

  const resolution = resolveWalletSession(request);
  if (resolution.response) return resolution.response;

  const params = await Promise.resolve(context.params);
  const targetId = params.id?.trim();
  if (!targetId) {
    return jsonError(
      { code: commonErrorCodes.validationError, message: "Session ID is required.", status: 400 },
      { legacy: { error: "session_id_required" } }
    );
  }

  const existing = getSession(targetId);
  if (!existing || existing.walletAddress.toLowerCase() !== resolution.wallet.toLowerCase()) {
    return jsonError(
      { code: commonErrorCodes.notFound, message: "Session not found.", status: 404 },
      { legacy: { error: "session_not_found" } }
    );
  }

  const revoked = revokeSession(targetId, "user_revoked_session");
  const response = NextResponse.json({ ok: true, sessionId: targetId, revoked: !!revoked });

  if (resolution.session && resolution.session.sessionId === targetId) {
    clearWalletCookie(response, targetId);
  }

  return response;
}
