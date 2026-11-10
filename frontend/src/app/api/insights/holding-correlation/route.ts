import { NextResponse } from "next/server";
import { analyzeHoldingCorrelation, holdingCorrelationRequestSchema } from "@/server/research/holding-correlation";
import { evaluateCapability } from "@/server/security/authz";
import { checkRateLimit } from "@/server/security/rateLimit";
import { resolveWalletSession } from "@/server/security/walletSession";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const rateLimited = checkRateLimit(request, { namespace: "holding-correlation:read", limit: 20, windowMs: 60_000 });
  if (rateLimited) return rateLimited;

  const body = await request.json().catch(() => null);
  const parsed = holdingCorrelationRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", details: parsed.error.flatten() }, { status: 400 });
  }

  const session = resolveWalletSession(request, { suppliedWallet: parsed.data.walletAddress });
  if (session.response) return session.response;
  const walletAddress = session.wallet!;

  const authz = evaluateCapability(
    { kind: "wallet", walletAddress, walletHash: "holding-correlation", chainFamily: "evm", network: parsed.data.network },
    "portfolio:read",
    { walletAddress, network: parsed.data.network },
  );
  if (!authz.allowed) return NextResponse.json({ error: "auth_error", reason: authz.reason }, { status: 403 });

  const result = await analyzeHoldingCorrelation(parsed.data);
  return NextResponse.json(result, {
    status: result.state === "unavailable" ? 503 : 200,
    headers: { "cache-control": "no-store" },
  });
}
