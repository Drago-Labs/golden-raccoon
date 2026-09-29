import { NextResponse, type NextRequest } from "next/server";
import { INCIDENT_LIMITS, IncidentError } from "@/server/research/incident-status/schema";
import { analyseIncidentStatus } from "@/server/research/incident-status/service";
import { checkRateLimit } from "@/server/security/rateLimit";

/**
 * Ephemeral incident-status analysis.
 *
 * The caller posts documents it already holds. The handler persists nothing,
 * scrapes no URL, and changes no news score.
 */
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const rateLimited = checkRateLimit(request, { namespace: "incident-status", limit: 30, windowMs: 60_000 });

  if (rateLimited) {
    return rateLimited;
  }

  const declaredLength = Number(request.headers.get("content-length") ?? "0");

  if (Number.isFinite(declaredLength) && declaredLength > INCIDENT_LIMITS.maxRequestBytes) {
    return NextResponse.json({ error: "payload_too_large", limitBytes: INCIDENT_LIMITS.maxRequestBytes }, { status: 413 });
  }

  let body: unknown;

  try {
    const raw = await request.text();

    if (raw.length > INCIDENT_LIMITS.maxRequestBytes) {
      return NextResponse.json({ error: "payload_too_large", limitBytes: INCIDENT_LIMITS.maxRequestBytes }, { status: 413 });
    }

    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  try {
    return NextResponse.json({ report: analyseIncidentStatus(body) }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof IncidentError) {
      return NextResponse.json(
        { error: error.code, message: error.message, details: error.details },
        { status: 400, headers: { "cache-control": "no-store" } },
      );
    }

    return NextResponse.json({ error: "incident_status_failed" }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}
