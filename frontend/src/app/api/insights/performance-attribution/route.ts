import { NextResponse, type NextRequest } from "next/server";
import { evaluateCapability } from "@/server/security/authz";
import { checkRateLimit } from "@/server/security/rateLimit";
import { resolveWalletSession } from "@/server/security/walletSession";
import { ATTRIBUTION_LIMITS, AttributionError, attributePerformance } from "@/server/research/performance-attribution";

export const dynamic = "force-dynamic";
const headers = { "cache-control": "no-store" } as const;

function field(input: unknown, name: "walletAddress" | "network"): string | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) return undefined;
  const value = (input as Record<string, unknown>)[name];
  return typeof value === "string" ? value : undefined;
}

export async function POST(request: NextRequest) {
  const limited = checkRateLimit(request, { namespace: "performance-attribution", limit: 12, windowMs: 60_000 });
  if (limited) return limited;

  if (Number(request.headers.get("content-length") ?? 0) > ATTRIBUTION_LIMITS.maxRequestBytes) {
    return NextResponse.json(
      { error: "payload_too_large", message: `Requests are limited to ${ATTRIBUTION_LIMITS.maxRequestBytes} bytes.` },
      { status: 413, headers },
    );
  }

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json", message: "The request body is not JSON." }, { status: 400, headers });
  }

  // The session cookie, not the request body, decides whose portfolio is attributed.
  const session = resolveWalletSession(request, { suppliedWallet: field(input, "walletAddress") });
  if (session.response) return session.response;
  const walletAddress = session.wallet!;
  const network = field(input, "network");
  const authz = evaluateCapability(
    { kind: "wallet", walletAddress, walletHash: "performance-attribution", chainFamily: network?.startsWith("stellar") ? "stellar" : "evm", network },
    "portfolio:read",
    { walletAddress, network },
  );
  if (!authz.allowed) return NextResponse.json({ error: "auth_error", reason: authz.reason }, { status: 403, headers });

  try {
    const result = await attributePerformance(
      input && typeof input === "object" && !Array.isArray(input) ? { ...input, walletAddress } : input,
    );
    return NextResponse.json(result, { status: result.state === "unavailable" ? 503 : 200, headers });
  } catch (error) {
    if (error instanceof AttributionError) {
      return NextResponse.json({ error: error.code, message: error.message, details: error.details }, { status: 400, headers });
    }
    return NextResponse.json(
      { error: "attribution_failed", message: "The recorded observations could not be attributed." },
      { status: 500, headers },
    );
  }
}
