import { NextResponse, type NextRequest } from "next/server";
import { PREFLIGHT_LIMITS, PreflightError } from "@/server/research/execution-preflight/schema";
import { analysePreflight } from "@/server/research/execution-preflight/service";
import { checkRateLimit } from "@/server/security/rateLimit";

/** Read-only preflight budget. Never signs or submits. */
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const rateLimited = checkRateLimit(request, { namespace: "execution-preflight", limit: 30, windowMs: 60_000 });
  if (rateLimited) return rateLimited;

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > PREFLIGHT_LIMITS.maxRequestBytes) {
    return NextResponse.json({ error: "payload_too_large", limitBytes: PREFLIGHT_LIMITS.maxRequestBytes }, { status: 413 });
  }

  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > PREFLIGHT_LIMITS.maxRequestBytes) {
      return NextResponse.json({ error: "payload_too_large", limitBytes: PREFLIGHT_LIMITS.maxRequestBytes }, { status: 413 });
    }
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  try {
    return NextResponse.json({ report: analysePreflight(body) }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof PreflightError) {
      return NextResponse.json(
        { error: error.code, message: error.message, details: error.details },
        { status: 400, headers: { "cache-control": "no-store" } },
      );
    }
    return NextResponse.json({ error: "preflight_failed" }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}
