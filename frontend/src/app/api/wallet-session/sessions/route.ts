import { NextRequest, NextResponse } from "next/server";
import {
  clearWalletCookie,
  resolveWalletSession,
} from "@/server/security/walletSession";
import {
  listSessionsForWallet,
  revokeAllSessionsForWallet,
} from "@/server/security/session";
import { checkRateLimitProfile } from "@/server/security/rateLimit";

/**
 * Lists all active and historical sessions registered for the authenticated wallet.
 *
 * @param request The incoming NextRequest.
 * @returns JSON response containing the list of sanitized session records.
 */
export async function GET(request: NextRequest) {
  const resolution = resolveWalletSession(request);
  if (resolution.response) return resolution.response;

  const sessions = listSessionsForWallet(resolution.wallet);
  return NextResponse.json({ sessions }, {
    status: 200,
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * Revokes all sessions registered for the authenticated wallet and clears the session cookie.
 *
 * @param request The incoming NextRequest.
 * @returns JSON response confirming the number of sessions revoked.
 */
export async function DELETE(request: NextRequest) {
  const rateLimited = checkRateLimitProfile(request, "alertRuleWrite");
  if (rateLimited) return rateLimited;

  const resolution = resolveWalletSession(request);
  if (resolution.response) return resolution.response;

  const count = revokeAllSessionsForWallet(resolution.wallet, "user_revoked_all");
  const response = NextResponse.json({ ok: true, revokedCount: count });
  clearWalletCookie(response, resolution.session?.sessionId);

  return response;
}
