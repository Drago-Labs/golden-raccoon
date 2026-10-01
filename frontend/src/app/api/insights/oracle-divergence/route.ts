import { NextResponse, type NextRequest } from "next/server";
import { analyseOracleDivergence, ORACLE_LIMITS, OracleError } from "@/server/research/oracle-divergence";
import { checkRateLimit } from "@/server/security/rateLimit";

/**
 * Read-only oracle-divergence analysis.
 *
 * The caller supplies the pairs, feeds, rounds and market quotes it already
 * holds; the handler reports what they show. It persists nothing, fetches
 * nothing, and never produces an executable quote or a trade instruction.
 */
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const rateLimited = checkRateLimit(request, { namespace: "oracle-divergence", limit: 30, windowMs: 60_000 });
  if (rateLimited) return rateLimited;

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > ORACLE_LIMITS.maxRequestBytes) {
    return NextResponse.json({ error: "payload_too_large", limitBytes: ORACLE_LIMITS.maxRequestBytes }, { status: 413 });
  }

  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > ORACLE_LIMITS.maxRequestBytes) {
      return NextResponse.json({ error: "payload_too_large", limitBytes: ORACLE_LIMITS.maxRequestBytes }, { status: 413 });
    }
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  try {
    return NextResponse.json({ report: analyseOracleDivergence(body) }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof OracleError) {
      return NextResponse.json({ error: error.code, message: error.message, details: error.details }, { status: 400, headers: { "cache-control": "no-store" } });
    }
    return NextResponse.json({ error: "oracle_analysis_failed" }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}
