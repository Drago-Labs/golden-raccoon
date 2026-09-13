import { NextResponse, type NextRequest } from "next/server";
import { LINEAGE_LIMITS, LineageError } from "@/server/research/news-lineage/schema";
import { analyseLineage } from "@/server/research/news-lineage/service";
import { checkRateLimit } from "@/server/security/rateLimit";

/**
 * Ephemeral lineage analysis.
 *
 * The caller posts article evidence it already holds. The handler persists
 * nothing, scrapes no article, and changes no news score: URLs are treated as
 * strings to canonicalize, never as addresses to fetch.
 */
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const rateLimited = checkRateLimit(request, { namespace: "news-lineage", limit: 30, windowMs: 60_000 });

  if (rateLimited) {
    return rateLimited;
  }

  const declaredLength = Number(request.headers.get("content-length") ?? "0");

  if (Number.isFinite(declaredLength) && declaredLength > LINEAGE_LIMITS.maxRequestBytes) {
    return NextResponse.json({ error: "payload_too_large", limitBytes: LINEAGE_LIMITS.maxRequestBytes }, { status: 413 });
  }

  let body: unknown;

  try {
    const raw = await request.text();

    if (raw.length > LINEAGE_LIMITS.maxRequestBytes) {
      return NextResponse.json({ error: "payload_too_large", limitBytes: LINEAGE_LIMITS.maxRequestBytes }, { status: 413 });
    }

    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  try {
    return NextResponse.json({ report: analyseLineage(body) }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof LineageError) {
      return NextResponse.json(
        { error: error.code, message: error.message, details: error.details },
        { status: 400, headers: { "cache-control": "no-store" } },
      );
    }

    return NextResponse.json({ error: "lineage_analysis_failed" }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}
