import { NextResponse } from "next/server";
import { withCacheHeaders } from "@/server/cache/strategy";
import { checkRateLimit } from "@/server/security/rateLimit";
import { applyStaleIfExpired, getRecoveryRequest } from "@/server/recovery";

export async function GET(request: Request) {
  const rateLimited = checkRateLimit(request, { namespace: "recovery:status", limit: 30, windowMs: 60_000 });

  if (rateLimited) {
    return rateLimited;
  }

  const params = new URL(request.url).searchParams;
  const id = params.get("id") ?? "";

  if (!id.startsWith("rec_")) {
    return NextResponse.json({ error: "id_required" }, { status: 400 });
  }

  const record = getRecoveryRequest(id);

  if (!record) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return withCacheHeaders(NextResponse.json({ recovery: applyStaleIfExpired(record) }), "recovery");
}
