import { NextResponse } from "next/server";
import { claimableRequestSchema, exploreClaimableBalances } from "@/server/research/claimable-balances";
import { resolveWalletSession } from "@/server/security/walletSession";
import { evaluateCapability } from "@/server/security/authz";
import { checkRateLimit } from "@/server/security/rateLimit";

export async function POST(request: Request) {
  const limited = checkRateLimit(request, { namespace: "claimable-balances:read", limit: 20, windowMs: 60_000 }); if (limited) return limited;
  const parsed = claimableRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_request", details: parsed.error.flatten() }, { status: 400 });
  const session = resolveWalletSession(request, { suppliedWallet: parsed.data.walletAddress }); if (session.response) return session.response;
  const walletAddress = session.wallet!;
  const authz = evaluateCapability({ kind: "wallet", walletAddress, walletHash: "claimable-balances", chainFamily: "stellar", network: parsed.data.network }, "portfolio:read", { walletAddress, network: parsed.data.network });
  if (!authz.allowed) return NextResponse.json({ error: "auth_error" }, { status: 403 });
  const result = await exploreClaimableBalances({ ...parsed.data, walletAddress });
  return NextResponse.json(result, { status: result.state === "unavailable" ? 503 : 200, headers: result.state === "unavailable" ? { "Retry-After": "15" } : undefined });
}
