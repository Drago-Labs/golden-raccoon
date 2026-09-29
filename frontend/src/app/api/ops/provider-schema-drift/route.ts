import { NextResponse, type NextRequest } from "next/server";
import { authorizeOperator } from "@/server/research/provider-schema-drift/auth";
import { DRIFT_LIMITS, DriftError } from "@/server/research/provider-schema-drift/schema";
import { analyseProviderDrift } from "@/server/research/provider-schema-drift/service";
import { checkRateLimit } from "@/server/security/rateLimit";

/** Operator-only provider schema-drift report. */
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const auth = authorizeOperator(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status, headers: { "cache-control": "no-store" } });
  }

  const rateLimited = checkRateLimit(request, { namespace: "provider-schema-drift", limit: 20, windowMs: 60_000 });
  if (rateLimited) return rateLimited;

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > DRIFT_LIMITS.maxRequestBytes) {
    return NextResponse.json({ error: "payload_too_large", limitBytes: DRIFT_LIMITS.maxRequestBytes }, { status: 413 });
  }

  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > DRIFT_LIMITS.maxRequestBytes) {
      return NextResponse.json({ error: "payload_too_large", limitBytes: DRIFT_LIMITS.maxRequestBytes }, { status: 413 });
    }
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  try {
    const report = analyseProviderDrift(body);
    const encoded = JSON.stringify(report);
    if (/sk-live|private_key|mnemonic|api[_-]?key/i.test(encoded)) {
      return NextResponse.json({ error: "redaction_failed" }, { status: 500, headers: { "cache-control": "no-store" } });
    }
    return NextResponse.json({ report }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof DriftError) {
      return NextResponse.json(
        { error: error.code, message: error.message, details: error.details },
        { status: 400, headers: { "cache-control": "no-store" } },
      );
    }
    return NextResponse.json({ error: "drift_analysis_failed" }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}
