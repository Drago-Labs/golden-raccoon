import { NextRequest, NextResponse } from "next/server";
import { withCacheHeaders } from "@/server/cache/strategy";
import { checkRateLimit } from "@/server/security/rateLimit";
import { listRecommendationRecordsPaginated } from "@/server/storage";

export function GET(request: NextRequest) {
  const rateLimited = checkRateLimit(request, { namespace: "history:recommendations", limit: 80, windowMs: 60_000 });

  if (rateLimited) {
    return rateLimited;
  }

  const walletAddress = request.nextUrl.searchParams.get("walletAddress") ?? undefined;
  const cursor = request.nextUrl.searchParams.get("cursor") ?? undefined;
  const limitRaw = request.nextUrl.searchParams.get("limit");
  const limit = limitRaw ? Math.min(Math.max(1, parseInt(limitRaw, 10)), 200) : 50;

  return withCacheHeaders(
    NextResponse.json(listRecommendationRecordsPaginated(walletAddress, { cursor, limit })),
    "history",
  );
}
