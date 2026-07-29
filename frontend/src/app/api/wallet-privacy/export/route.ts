import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { resolveWalletSession } from "@/server/security/walletSession";
import { exportWalletData } from "@/server/storage";
import { checkRateLimitProfile } from "@/server/security/rateLimit";

export async function GET(request: NextRequest) {
  const rateLimited = checkRateLimitProfile(request, "alertRead");
  if (rateLimited) return rateLimited;

  const url = new URL(request.url);
  const suppliedWallet = url.searchParams.get("walletAddress");
  const network = url.searchParams.get("network") ?? undefined;
  const chainFamily = (url.searchParams.get("chainFamily") as "evm" | "stellar") ?? undefined;

  const session = resolveWalletSession(request, { suppliedWallet });
  if (session.response) return session.response;

  const exportResult = await exportWalletData(session.wallet!, network, chainFamily);

  const response = NextResponse.json(exportResult);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function POST(request: NextRequest) {
  const rateLimited = checkRateLimitProfile(request, "alertRead");
  if (rateLimited) return rateLimited;

  const body = await request.json().catch(() => ({}));
  const suppliedWallet = typeof body?.walletAddress === "string" ? body.walletAddress : undefined;
  const network = typeof body?.network === "string" ? body.network : undefined;
  const chainFamily = (body?.chainFamily === "evm" || body?.chainFamily === "stellar") ? body.chainFamily : undefined;

  const session = resolveWalletSession(request, { suppliedWallet });
  if (session.response) return session.response;

  const exportResult = await exportWalletData(session.wallet!, network, chainFamily);

  const response = NextResponse.json(exportResult);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
