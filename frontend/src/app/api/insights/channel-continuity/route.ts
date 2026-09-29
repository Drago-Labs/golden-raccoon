import { NextResponse, type NextRequest } from "next/server";
import { CONTINUITY_LIMITS, ContinuityError } from "@/server/research/channel-continuity/schema";
import { inspectChannelContinuity } from "@/server/research/channel-continuity/service";
import { checkRateLimit } from "@/server/security/rateLimit";

/**
 * Stateless channel-continuity inspection.
 *
 * Observations are read from the request body, analysed, and discarded when the
 * handler returns. Nothing is written to storage, no URL is fetched, and no
 * social score is mutated.
 */
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const rateLimited = checkRateLimit(request, { namespace: "channel-continuity", limit: 20, windowMs: 60_000 });

  if (rateLimited) {
    return rateLimited;
  }

  const declaredLength = Number(request.headers.get("content-length") ?? "0");

  if (Number.isFinite(declaredLength) && declaredLength > CONTINUITY_LIMITS.maxRequestBytes) {
    return NextResponse.json({ error: "payload_too_large", limitBytes: CONTINUITY_LIMITS.maxRequestBytes }, { status: 413 });
  }

  let body: unknown;

  try {
    const raw = await request.text();

    if (raw.length > CONTINUITY_LIMITS.maxRequestBytes) {
      return NextResponse.json({ error: "payload_too_large", limitBytes: CONTINUITY_LIMITS.maxRequestBytes }, { status: 413 });
    }

    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  try {
    return NextResponse.json({ report: inspectChannelContinuity(body) }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof ContinuityError) {
      return NextResponse.json(
        { error: error.code, message: error.message, details: error.details },
        { status: 400, headers: { "cache-control": "no-store" } },
      );
    }

    return NextResponse.json({ error: "continuity_analysis_failed" }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}
