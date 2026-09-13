import { NextResponse, type NextRequest } from "next/server";
import { PEG_LIMITS, PegError } from "@/server/research/peg-observations/schema";
import { analysePegObservations } from "@/server/research/peg-observations/service";
import { checkRateLimit } from "@/server/security/rateLimit";

/**
 * Stateless peg analysis.
 *
 * The caller supplies the peg declarations, the observations and any reference
 * rates. The handler persists nothing, makes no outbound request, and adds no
 * mandatory paid provider: a wallet with no observation history gets an honest
 * empty report rather than a synthesised one.
 */
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const rateLimited = checkRateLimit(request, { namespace: "peg-observations", limit: 30, windowMs: 60_000 });

  if (rateLimited) {
    return rateLimited;
  }

  const declaredLength = Number(request.headers.get("content-length") ?? "0");

  if (Number.isFinite(declaredLength) && declaredLength > PEG_LIMITS.maxRequestBytes) {
    return NextResponse.json({ error: "payload_too_large", limitBytes: PEG_LIMITS.maxRequestBytes }, { status: 413 });
  }

  let body: unknown;

  try {
    const raw = await request.text();

    if (raw.length > PEG_LIMITS.maxRequestBytes) {
      return NextResponse.json({ error: "payload_too_large", limitBytes: PEG_LIMITS.maxRequestBytes }, { status: 413 });
    }

    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  try {
    return NextResponse.json({ report: analysePegObservations(body) }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof PegError) {
      return NextResponse.json(
        { error: error.code, message: error.message, details: error.details },
        { status: error.code === "bounds_exceeded" ? 413 : 400, headers: { "cache-control": "no-store" } },
      );
    }

    return NextResponse.json({ error: "peg_analysis_failed" }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}
