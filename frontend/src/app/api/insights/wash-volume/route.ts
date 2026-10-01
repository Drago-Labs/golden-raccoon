import { NextResponse, type NextRequest } from "next/server";
import { checkRateLimit } from "@/server/security/rateLimit";
import { WashVolumeError, analyzeWashVolume, type Trade } from "@/server/research/wash-volume/service";

export const dynamic = "force-dynamic";
const noStore = { "cache-control": "no-store" } as const;

export async function POST(request: NextRequest) {
  const rateLimited = checkRateLimit(request, { namespace: "wash-volume", limit: 20, windowMs: 60_000 });
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
  const record = body as { pair?: string; trades?: Trade[]; windowMs?: number; truncated?: boolean };
  try {
    return NextResponse.json({
      report: analyzeWashVolume({
        pair: record.pair ?? "",
        trades: record.trades ?? [],
        windowMs: record.windowMs,
        truncated: record.truncated,
      }),
    }, { headers: noStore });
  } catch (error) {
    if (error instanceof WashVolumeError) {
      return NextResponse.json({ error: error.code, message: error.message }, { status: 400, headers: noStore });
    }
    return NextResponse.json({ error: "wash_volume_failed" }, { status: 500, headers: noStore });
  }
}
