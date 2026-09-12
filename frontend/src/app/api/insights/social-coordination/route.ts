import { NextResponse, type NextRequest } from "next/server";
import { COORDINATION_LIMITS, CoordinationError } from "@/server/research/social-coordination/schema";
import { analyseCoordination } from "@/server/research/social-coordination/service";
import { checkRateLimit } from "@/server/security/rateLimit";

/**
 * Stateless coordination analysis.
 *
 * Observations are read from the request body, analysed, and discarded when the
 * handler returns. Nothing is written to storage or cache, no social API is
 * called, and no private account information is requested: author keys are
 * opaque strings the caller already had.
 */
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const rateLimited = checkRateLimit(request, { namespace: "social-coordination", limit: 20, windowMs: 60_000 });

  if (rateLimited) {
    return rateLimited;
  }

  const declaredLength = Number(request.headers.get("content-length") ?? "0");

  if (Number.isFinite(declaredLength) && declaredLength > COORDINATION_LIMITS.maxRequestBytes) {
    return NextResponse.json({ error: "payload_too_large", limitBytes: COORDINATION_LIMITS.maxRequestBytes }, { status: 413 });
  }

  let body: unknown;

  try {
    const raw = await request.text();

    if (raw.length > COORDINATION_LIMITS.maxRequestBytes) {
      return NextResponse.json({ error: "payload_too_large", limitBytes: COORDINATION_LIMITS.maxRequestBytes }, { status: 413 });
    }

    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  try {
    return NextResponse.json({ report: analyseCoordination(body) }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof CoordinationError) {
      return NextResponse.json(
        { error: error.code, message: error.message, details: error.details },
        { status: 400, headers: { "cache-control": "no-store" } },
      );
    }

    return NextResponse.json({ error: "coordination_analysis_failed" }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}
