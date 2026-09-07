import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/server/security/rateLimit";
import { parseQuery } from "@/server/api/query/validate";
import { ApiError, jsonError } from "@/server/api/errors";
import { listDiscoveryAlertsPaginated } from "@/server/storage";
import { z } from "zod";

const filterSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().optional(),
  sortBy: z.string().optional(),
  sortDirection: z.enum(["asc", "desc"]).optional(),
  walletAddress: z.string().optional(),
});

export async function GET(request: NextRequest) {
  const rateLimited = checkRateLimit(request, { namespace: "discovery:list", limit: 60, windowMs: 60_000 });
  if (rateLimited) return rateLimited;
  try {
    const raw = Object.fromEntries(request.nextUrl.searchParams.entries());
    const q = parseQuery(raw, "discovery", filterSchema);
    const result = listDiscoveryAlertsPaginated(q.walletAddress ?? q.filters.walletAddress, {
      cursor: q.cursor,
      limit: q.limit,
      sortBy: q.sortBy,
      sortDirection: q.sortDirection,
    });
    return NextResponse.json({ items: result.items, nextCursor: result.nextCursor, hasMore: result.hasMore, total: result.total });
  } catch (e: unknown) {
    if (e instanceof ApiError && e.code === "validation_error") return jsonError(e, { legacy: { error: e.message } });
    throw e;
  }
}
