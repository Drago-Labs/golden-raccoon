import { NextResponse, type NextRequest } from "next/server";
import { analyseReserveAttestations, RESERVE_LIMITS, ReserveError } from "@/server/research/reserve-attestation";
import { checkRateLimit } from "@/server/security/rateLimit";

/**
 * Read-only reserve-attestation evidence review.
 *
 * The caller supplies its own asset+issuer registry and the reports it
 * already holds; the handler compares them and reports what they show. It
 * fetches nothing, scrapes nothing, and persists nothing.
 */
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const rateLimited = checkRateLimit(request, { namespace: "reserve-attestation", limit: 30, windowMs: 60_000 });
  if (rateLimited) return rateLimited;

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > RESERVE_LIMITS.maxRequestBytes) {
    return NextResponse.json({ error: "payload_too_large", limitBytes: RESERVE_LIMITS.maxRequestBytes }, { status: 413 });
  }

  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > RESERVE_LIMITS.maxRequestBytes) {
      return NextResponse.json({ error: "payload_too_large", limitBytes: RESERVE_LIMITS.maxRequestBytes }, { status: 413 });
    }
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  try {
    return NextResponse.json({ report: analyseReserveAttestations(body) }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof ReserveError) {
      return NextResponse.json({ error: error.code, message: error.message, details: error.details }, { status: 400, headers: { "cache-control": "no-store" } });
    }
    return NextResponse.json({ error: "reserve_analysis_failed" }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}
