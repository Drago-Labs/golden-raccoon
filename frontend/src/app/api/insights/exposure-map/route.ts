import { NextResponse, type NextRequest } from "next/server";
import { EXPOSURE_LIMITS, ExposureMapError } from "@/server/research/exposure-map/schema";
import { buildExposureMap } from "@/server/research/exposure-map/service";
import { checkRateLimit } from "@/server/security/rateLimit";

/**
 * Read-only analysis endpoint.
 *
 * The caller posts the holdings it already holds plus the relationships it
 * vouches for. The handler derives a map and returns it. It persists nothing,
 * makes no outbound request, and calls no stress, cost-basis or execution
 * service.
 */
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const rateLimited = checkRateLimit(request, { namespace: "exposure-map", limit: 30, windowMs: 60_000 });

  if (rateLimited) {
    return rateLimited;
  }

  const declaredLength = Number(request.headers.get("content-length") ?? "0");

  if (Number.isFinite(declaredLength) && declaredLength > EXPOSURE_LIMITS.maxRequestBytes) {
    return NextResponse.json({ error: "payload_too_large", limitBytes: EXPOSURE_LIMITS.maxRequestBytes }, { status: 413 });
  }

  let body: unknown;

  try {
    const raw = await request.text();

    if (raw.length > EXPOSURE_LIMITS.maxRequestBytes) {
      return NextResponse.json({ error: "payload_too_large", limitBytes: EXPOSURE_LIMITS.maxRequestBytes }, { status: 413 });
    }

    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  try {
    const result = buildExposureMap(body);

    return NextResponse.json(
      { map: result.map, unmatchedDeclarations: result.unmatchedDeclarations },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof ExposureMapError) {
      return NextResponse.json(
        { error: error.code, message: error.message, details: error.details },
        { status: error.code === "bounds_exceeded" ? 413 : 400, headers: { "cache-control": "no-store" } },
      );
    }

    return NextResponse.json({ error: "exposure_map_failed" }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}
