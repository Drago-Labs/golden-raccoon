import { NextResponse, type NextRequest } from "next/server";
import { EVIDENCE_LIMITS, EvidenceError } from "@/server/research/evidence-coverage/schema";
import { exploreEvidence } from "@/server/research/evidence-coverage/service";
import { checkRateLimit } from "@/server/security/rateLimit";

/**
 * Bounded, ephemeral evidence analysis.
 *
 * The caller posts a report it already holds. The handler persists nothing,
 * fetches no source URL, recomputes no score, and never forwards a provider
 * payload: only the fields the feature explicitly models cross the boundary.
 */
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const rateLimited = checkRateLimit(request, { namespace: "evidence-coverage", limit: 30, windowMs: 60_000 });

  if (rateLimited) {
    return rateLimited;
  }

  const declaredLength = Number(request.headers.get("content-length") ?? "0");

  if (Number.isFinite(declaredLength) && declaredLength > EVIDENCE_LIMITS.maxRequestBytes) {
    return NextResponse.json({ error: "payload_too_large", limitBytes: EVIDENCE_LIMITS.maxRequestBytes }, { status: 413 });
  }

  let body: unknown;

  try {
    const raw = await request.text();

    if (raw.length > EVIDENCE_LIMITS.maxRequestBytes) {
      return NextResponse.json({ error: "payload_too_large", limitBytes: EVIDENCE_LIMITS.maxRequestBytes }, { status: 413 });
    }

    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  try {
    return NextResponse.json({ report: exploreEvidence(body) }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof EvidenceError) {
      return NextResponse.json(
        { error: error.code, message: error.message, details: error.details },
        { status: 400, headers: { "cache-control": "no-store" } },
      );
    }

    return NextResponse.json({ error: "evidence_analysis_failed" }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}
