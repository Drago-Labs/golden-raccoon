import { NextResponse } from "next/server";
import { evaluateCapability } from "@/server/security/authz";
import { checkRateLimit } from "@/server/security/rateLimit";
import { resolveWalletSession } from "@/server/security/walletSession";
import { inspectProxy, proxyRequestSchema } from "@/server/research/proxy-inspector";
export async function POST(request: Request) {
  const limited = checkRateLimit(request, { namespace: "proxy-inspector:read", limit: 20, windowMs: 60_000 }); if (limited) return limited;
  const parsed = proxyRequestSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: "invalid_request", details: parsed.error.flatten() }, { status: 400 });
  const session = resolveWalletSession(request, { suppliedWallet: parsed.data.walletAddress }); if (session.response) return session.response;
  const access = evaluateCapability({ kind: "wallet", walletAddress: session.wallet, walletHash: "proxy-inspector", chainFamily: "evm", network: parsed.data.network }, "portfolio:read", { walletAddress: session.wallet, network: parsed.data.network });
  if (!access.allowed) return NextResponse.json({ error: "auth_error" }, { status: 403 });
  const result = await inspectProxy(parsed.data); return NextResponse.json(result, { status: result.state === "unavailable" ? 503 : 200 });
}
