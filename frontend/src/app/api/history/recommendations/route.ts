import { NextRequest, NextResponse } from "next/server";
import { withCacheHeaders } from "@/server/cache/strategy";
import { checkRateLimit } from "@/server/security/rateLimit";
import { listRecommendationRecordsPaginated } from "@/server/storage";
import { parseQuery } from "@/server/api/query/validate";
import { jsonError } from "@/server/api/errors";
import { z } from "zod";

const filterSchema = z.object({
  walletAddress: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().optional(),
  sortBy: z.string().optional(),
  sortDirection: z.enum(["asc", "desc"]).optional(),
});

export function GET(request: NextRequest) {
  const rateLimited = checkRateLimit(request, { namespace: "history:recommendations", limit: 80, windowMs: 60_000 });
  if (rateLimited) return rateLimited;
  try {
    const raw = Object.fromEntries(request.nextUrl.searchParams.entries());
    const q = parseQuery(raw, "recommendations", filterSchema);
    const result = listRecommendationRecordsPaginated(q.walletAddress ?? q.filters.walletAddress, {
      cursor: q.cursor,
      limit: q.limit,
      sortBy: q.sortBy,
      sortDirection: q.sortDirection,
    });
    return withCacheHeaders(NextResponse.json({ items: result.items, nextCursor: result.nextCursor, hasMore: result.hasMore, total: result.total }), "history");
  } catch (e) {
    if (e instanceof Error && (e as any).code === "validation_error") return jsonError(e as any, { legacy: { error: (e as any).message } });
    throw e;
  }
}
