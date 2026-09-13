import { NextResponse } from "next/server";
import { allowanceInventoryRequestSchema, buildAllowanceInventory } from "@/server/research/allowance-inventory";
import { evaluateCapability } from "@/server/security/authz";
import { checkRateLimit } from "@/server/security/rateLimit";
import { resolveWalletSession } from "@/server/security/walletSession";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const rateLimited = checkRateLimit(request, { namespace: "allowance-inventory:read", limit: 12, windowMs: 60_000 });
  if (rateLimited) return rateLimited;

  const body = await request.json().catch(() => null);
  const parsed = allowanceInventoryRequestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_request", details: parsed.error.flatten() }, { status: 400 });

  const session = resolveWalletSession(request, { suppliedWallet: parsed.data.walletAddress });
  if (session.response) return session.response;
  const walletAddress = session.wallet!;
  const authz = evaluateCapability(
    { kind: "wallet", walletAddress, walletHash: "allowance-inventory", chainFamily: "evm", network: parsed.data.network },
    "portfolio:read",
    { walletAddress, network: parsed.data.network },
  );
  if (!authz.allowed) return NextResponse.json({ error: "auth_error", reason: authz.reason }, { status: 403 });

  try {
    const result = await buildAllowanceInventory({ ...parsed.data, walletAddress });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Inventory scan failed";
    return NextResponse.json({ error: "inventory_unavailable", message }, { status: 503, headers: { "Retry-After": "15" } });
  }
}
