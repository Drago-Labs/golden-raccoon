import { NextResponse } from "next/server";
import { buildReservePlan, reservePlannerRequestSchema } from "@/server/research/reserve-planner";
import { evaluateCapability } from "@/server/security/authz";
import { checkRateLimit } from "@/server/security/rateLimit";
import { resolveWalletSession } from "@/server/security/walletSession";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const limited = checkRateLimit(request, { namespace: "reserve-planner:read", limit: 20, windowMs: 60_000 });
  if (limited) return limited;
  const parsed = reservePlannerRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_request", details: parsed.error.flatten() }, { status: 400 });
  const session = resolveWalletSession(request, { suppliedWallet: parsed.data.walletAddress });
  if (session.response) return session.response;
  const walletAddress = session.wallet!;
  const authz = evaluateCapability(
    { kind: "wallet", walletAddress, walletHash: "reserve-planner", chainFamily: "stellar", network: parsed.data.network },
    "portfolio:read",
    { walletAddress, network: parsed.data.network },
  );
  if (!authz.allowed) return NextResponse.json({ error: "auth_error", reason: authz.reason }, { status: 403 });
  const result = await buildReservePlan({ ...parsed.data, walletAddress });
  return NextResponse.json(result, { status: result.state === "unavailable" ? 503 : 200, headers: result.state === "unavailable" ? { "Retry-After": "15" } : undefined });
}
