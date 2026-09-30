import { NextResponse, type NextRequest } from "next/server";
import { checkRateLimit } from "@/server/security/rateLimit";
import { VenueTimelineError, buildVenueTimeline, type VenueObservation } from "@/server/research/venue-timeline/service";

export const dynamic = "force-dynamic";
const noStore = { "cache-control": "no-store" } as const;

export async function POST(request: NextRequest) {
  const rateLimited = checkRateLimit(request, { namespace: "venue-timeline", limit: 20, windowMs: 60_000 });
  if (rateLimited) return rateLimited;
  let body: unknown;
  try {
    body = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400, headers: noStore });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid_request" }, { status: 400, headers: noStore });
  }
  const record = body as { chainId?: number; contract?: string; snapshots?: VenueObservation[][] };
  try {
    return NextResponse.json({
      report: buildVenueTimeline({
        chainId: record.chainId ?? 0,
        contract: record.contract ?? "",
        snapshots: record.snapshots ?? [],
      }),
    }, { headers: noStore });
  } catch (error) {
    if (error instanceof VenueTimelineError) {
      return NextResponse.json({ error: error.code, message: error.message }, { status: 400, headers: noStore });
    }
    return NextResponse.json({ error: "venue_timeline_failed" }, { status: 500, headers: noStore });
  }
}
