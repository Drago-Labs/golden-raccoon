import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  applyWalletCookie,
  clearWalletCookie,
  isWalletSessionCookieAllowed,
  readWalletSessionCookie,
} from "@/server/security/walletSession";
import { checkRateLimitProfile } from "@/server/security/rateLimit";

const walletSchema = z.object({
  walletAddress: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^0x[0-9a-fA-F]{6,}$|^G[A-Z2-7]{20,}$/, "Wallet does not match a known format."),
});

function notConfigured() {
  return NextResponse.json(
    {
      error: "wallet_session_disabled",
      detail:
        "Set ALLOW_WALLET_SESSION_COOKIE=1 in this deployment to enable server-side wallet scoping for alert APIs.",
    },
    { status: 503 },
  );
}

export async function POST(request: NextRequest) {
  const rateLimited = checkRateLimitProfile(request, "alertRuleWrite");
  if (rateLimited) return rateLimited;

  if (!isWalletSessionCookieAllowed()) return notConfigured();

  const body = await request.json().catch(() => ({}));
  const parsed = walletSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const wallet = parsed.data.walletAddress.trim().toLowerCase();
  const response = NextResponse.json({ walletAddress: wallet, ttlSeconds: 60 * 60 * 12 });

  return applyWalletCookie(response, wallet);
}

export function GET(request: NextRequest) {
  const wallet = readWalletSessionCookie(request);

  if (!wallet) {
    return NextResponse.json({ walletAddress: null }, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  }

  return NextResponse.json(
    { walletAddress: wallet },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}

export async function DELETE(request: NextRequest) {
  const rateLimited = checkRateLimitProfile(request, "alertRuleWrite");
  if (rateLimited) return rateLimited;

  const response = NextResponse.json({ walletAddress: null });
  return clearWalletCookie(response);
}
