import { NextResponse, type NextRequest } from "next/server";
import { ComparisonError } from "@/server/research/report-comparison/schema";
import { compareSnapshots } from "@/server/research/report-comparison/service";
import { checkRateLimit } from "@/server/security/rateLimit";

/**
 * Ephemeral comparison endpoint.
 *
 * Reads two snapshots through the existing integrity gate and returns a
 * descriptive delta. It writes nothing, caches nothing, and cannot extend an
 * expiry or bypass a revocation: every read goes through `readRiskSnapshot`.
 */
export const dynamic = "force-dynamic";

/** Snapshot read failures that are the caller's situation, not a server fault. */
const STATUS_BY_CODE: Record<string, number> = {
  invalid_request: 400,
  not_found: 404,
  revoked: 410,
  expired: 410,
  tampered: 409,
  identity_collision: 409,
  unknown_version: 422,
  cross_asset: 422,
  cross_network: 422,
};

export async function GET(request: NextRequest) {
  const rateLimited = checkRateLimit(request, { namespace: "report-comparison", limit: 30, windowMs: 60_000 });

  if (rateLimited) {
    return rateLimited;
  }

  try {
    const comparison = await compareSnapshots({
      leftId: request.nextUrl.searchParams.get("leftId") ?? undefined,
      rightId: request.nextUrl.searchParams.get("rightId") ?? undefined,
    });

    return NextResponse.json({ comparison }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof ComparisonError) {
      return NextResponse.json(
        { error: error.code, message: error.detail, side: error.side },
        { status: STATUS_BY_CODE[error.code] ?? 400, headers: { "cache-control": "no-store" } },
      );
    }

    return NextResponse.json({ error: "comparison_failed" }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}
