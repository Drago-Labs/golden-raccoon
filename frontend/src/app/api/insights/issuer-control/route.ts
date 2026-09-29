import { NextResponse } from "next/server";
import { StrKey } from "@stellar/stellar-sdk";
import { issuerControlRequestSchema, inspectIssuerControl } from "@/server/research/issuer-control";
import { resolveWalletSession } from "@/server/security/walletSession";
import { evaluateCapability } from "@/server/security/authz";
import { checkRateLimit } from "@/server/security/rateLimit";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const limited = checkRateLimit(request, { namespace: "issuer-control:read", limit: 20, windowMs: 60_000 });
  if (limited) return limited;

  const parsed = issuerControlRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", details: parsed.error.flatten() }, { status: 400 });
  }

  const session = resolveWalletSession(request, { suppliedWallet: parsed.data.walletAddress });
  if (session.response) return session.response;
  const walletAddress = session.wallet!;

  const accountAddress = parsed.data.accountAddress ?? walletAddress;
  if (!StrKey.isValidEd25519PublicKey(accountAddress)) {
    return NextResponse.json({ error: "invalid_request", details: { accountAddress: ["Expected a Stellar account"] } }, { status: 400 });
  }

  const authz = evaluateCapability(
    {
      kind: "wallet",
      walletAddress,
      walletHash: "issuer-control",
      chainFamily: "stellar",
      network: parsed.data.network,
    },
    "portfolio:read",
    { walletAddress, network: parsed.data.network },
  );
  if (!authz.allowed) return NextResponse.json({ error: "auth_error" }, { status: 403 });

  const result = await inspectIssuerControl({ ...parsed.data, walletAddress, accountAddress });
  return NextResponse.json(result, {
    status: result.state === "unavailable" ? 503 : 200,
    headers: result.state === "unavailable" ? { "Retry-After": "15" } : undefined,
  });
}
