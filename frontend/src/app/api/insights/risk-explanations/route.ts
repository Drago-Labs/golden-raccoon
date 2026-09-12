import { NextResponse, type NextRequest } from "next/server";
import {
  EXPLANATION_LIMITS,
  ExplanationValidationError,
} from "@/server/research/risk-explanations/schema";
import { explainReport } from "@/server/research/risk-explanations/service";
import { checkRateLimit } from "@/server/security/rateLimit";

/**
 * Ephemeral analysis endpoint. The caller posts a report it already holds; the
 * handler derives an explanation and returns it. Nothing is persisted, no
 * outbound request is made, and no wallet-derived value is cached.
 */
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const rateLimited = checkRateLimit(request, { namespace: "risk-explanations", limit: 30, windowMs: 60_000 });

  if (rateLimited) {
    return rateLimited;
  }

  const declaredLength = Number(request.headers.get("content-length") ?? "0");

  if (Number.isFinite(declaredLength) && declaredLength > EXPLANATION_LIMITS.maxRequestBytes) {
    return NextResponse.json(
      { error: "payload_too_large", limitBytes: EXPLANATION_LIMITS.maxRequestBytes },
      { status: 413 },
    );
  }

  let body: unknown;

  try {
    const raw = await request.text();

    if (raw.length > EXPLANATION_LIMITS.maxRequestBytes) {
      return NextResponse.json(
        { error: "payload_too_large", limitBytes: EXPLANATION_LIMITS.maxRequestBytes },
        { status: 413 },
      );
    }

    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  try {
    const result = explainReport(body);

    return NextResponse.json(
      {
        explanation: result.explanation,
        contradictions: result.contradictions,
        sourceHealth: result.sourceHealth,
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof ExplanationValidationError) {
      const status = error.code === "unsupported_report_version" ? 422 : error.code === "report_too_large" ? 413 : 400;

      return NextResponse.json({ error: error.code, message: error.message, details: error.details }, { status });
    }

    return NextResponse.json({ error: "explanation_failed" }, { status: 500 });
  }
}
