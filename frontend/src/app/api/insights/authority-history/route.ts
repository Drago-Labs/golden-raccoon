import { NextResponse } from "next/server";
import {
  AUTHORITY_LIMITS,
  AuthorityHistoryError,
  authorityHistoryRequestSchema,
  buildAuthorityHistory,
} from "@/server/research/authority-history";
import { evaluateCapability } from "@/server/security/authz";
import { checkRateLimit } from "@/server/security/rateLimit";
import { resolveWalletSession } from "@/server/security/walletSession";

/**
 * Contract-scoped, read-only authority history.
 *
 * Wallet session ownership is authoritative. The endpoint caches nothing and
 * never grants, revokes, or upgrades — it only reads bounded event logs.
 */
export const dynamic = "force-dynamic";

const noStore = { "cache-control": "no-store" } as const;

export async function POST(request: Request) {
  const rateLimited = checkRateLimit(request, {
    namespace: "authority-history:read",
    limit: 12,
    windowMs: 60_000,
  });
  if (rateLimited) return rateLimited;

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > AUTHORITY_LIMITS.maxRequestBytes) {
    return NextResponse.json(
      { error: "payload_too_large", limitBytes: AUTHORITY_LIMITS.maxRequestBytes },
      { status: 413, headers: noStore },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = authorityHistoryRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", details: parsed.error.flatten() },
      { status: 400, headers: noStore },
    );
  }

  const session = resolveWalletSession(request, { suppliedWallet: parsed.data.walletAddress });
  if (session.response) return session.response;

  const walletAddress = session.wallet!;
  const authz = evaluateCapability(
    {
      kind: "wallet",
      walletAddress,
      walletHash: "authority-history",
      chainFamily: "evm",
      network: parsed.data.network,
    },
    "portfolio:read",
    { walletAddress, network: parsed.data.network },
  );
  if (!authz.allowed) {
    return NextResponse.json({ error: "auth_error", reason: authz.reason }, { status: 403, headers: noStore });
  }

  try {
    const report = await buildAuthorityHistory({ ...parsed.data, walletAddress });
    return NextResponse.json(
      { report },
      { status: report.coverage.state === "unavailable" ? 503 : 200, headers: noStore },
    );
  } catch (error) {
    if (error instanceof AuthorityHistoryError) {
      return NextResponse.json(
        { error: error.code, message: error.message, details: error.details },
        { status: 400, headers: noStore },
      );
    }
    const message = error instanceof Error ? error.message : "Authority history scan failed";
    return NextResponse.json(
      { error: "authority_history_unavailable", message },
      { status: 503, headers: { ...noStore, "Retry-After": "15" } },
    );
  }
}
