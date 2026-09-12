import { NextResponse, type NextRequest } from "next/server";
import { LIQUIDITY_LIMITS, LiquidityError } from "@/server/research/liquidity-depth/schema";
import { analyseLiquidity } from "@/server/research/liquidity-depth/service";
import { checkRateLimit } from "@/server/security/rateLimit";

/**
 * Read-only liquidity analysis.
 *
 * The caller supplies venue snapshots it already holds; the handler reports
 * what they show. It persists nothing, makes no outbound request, and has no
 * code path that produces an executable quote, a route selection or a
 * transaction.
 */
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const rateLimited = checkRateLimit(request, { namespace: "liquidity-depth", limit: 30, windowMs: 60_000 });

  if (rateLimited) {
    return rateLimited;
  }

  const declaredLength = Number(request.headers.get("content-length") ?? "0");

  if (Number.isFinite(declaredLength) && declaredLength > LIQUIDITY_LIMITS.maxRequestBytes) {
    return NextResponse.json({ error: "payload_too_large", limitBytes: LIQUIDITY_LIMITS.maxRequestBytes }, { status: 413 });
  }

  let body: unknown;

  try {
    const raw = await request.text();

    if (raw.length > LIQUIDITY_LIMITS.maxRequestBytes) {
      return NextResponse.json({ error: "payload_too_large", limitBytes: LIQUIDITY_LIMITS.maxRequestBytes }, { status: 413 });
    }

    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  try {
    return NextResponse.json({ report: analyseLiquidity(body) }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof LiquidityError) {
      return NextResponse.json(
        { error: error.code, message: error.message, details: error.details },
        { status: 400, headers: { "cache-control": "no-store" } },
      );
    }

    return NextResponse.json({ error: "liquidity_analysis_failed" }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}
