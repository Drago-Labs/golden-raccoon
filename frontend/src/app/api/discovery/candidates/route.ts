import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/server/security/rateLimit";
import { listDiscoveryCandidates } from "@/server/discovery/pipeline";
import { fetchLiveDiscoveryCandidates, isOfflineSnapshot } from "@/server/discovery/sources";
import { parseQuery } from "@/server/api/query/validate";
import { ApiError, jsonError } from "@/server/api/errors";
import { compareSortValues, paginateArray, readRecordValue } from "@/server/api/query/envelope";

const bodySchema = z.object({
  chain: z.string().min(1).max(64).optional(),
  provider: z.enum(["dexscreener", "stellar_market", "manual"]).default("manual"),
});

export async function POST(request: Request) {
  const rateLimited = checkRateLimit(request, { namespace: "discovery:candidates", limit: 30, windowMs: 60_000 });
  if (rateLimited) return rateLimited;
  const body: Record<string, unknown> = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const allCandidates = await listDiscoveryCandidates(parsed.data.chain, {
    listCandidates: async (chain) => {
      const live = await fetchLiveDiscoveryCandidates(chain);
      const filteredByProvider = parsed.data.provider === "manual" ? live.candidates : live.candidates.filter((candidate) => candidate.source === parsed.data.provider);
      return filteredByProvider;
    },
  });
  // Pagination for discovery candidates — shared contract via query/body
  const url = new URL(request.url);
  const toQueryString = (value: unknown): string | undefined =>
    typeof value === "string" ? value : typeof value === "number" ? String(value) : undefined;
  const limitRaw = url.searchParams.get("limit") ?? toQueryString(body.limit);
  const cursor = url.searchParams.get("cursor") ?? toQueryString(body.cursor);
  const sortBy = url.searchParams.get("sortBy") ?? toQueryString(body.sortBy);
  const sortDirectionRaw = url.searchParams.get("sortDirection") ?? toQueryString(body.sortDirection);
  const sortDirection = sortDirectionRaw === "asc" || sortDirectionRaw === "desc" ? sortDirectionRaw : undefined;
  try {
    const filterSchema = z.object({
      cursor: z.string().optional(),
      limit: z.coerce.number().optional(),
      sortBy: z.string().optional(),
      sortDirection: z.enum(["asc", "desc"]).optional(),
      chain: z.string().optional(),
      provider: z.string().optional(),
    });
    const raw: Record<string, unknown> = {
      cursor: cursor ?? undefined,
      limit: limitRaw ?? undefined,
      sortBy: sortBy ?? undefined,
      sortDirection: sortDirection ?? undefined,
      chain: parsed.data.chain,
      provider: parsed.data.provider,
    };
    const q = parseQuery(raw, "discovery", filterSchema);
    // Sort candidates by score or createdAt for stability
    const sortKey = q.sortBy ?? "score";
    const sorted = [...allCandidates].sort((a, b) => {
      const av = readRecordValue(a, sortKey) ?? readRecordValue(a, "score") ?? 0;
      const bv = readRecordValue(b, sortKey) ?? readRecordValue(b, "score") ?? 0;
      const cmp = compareSortValues(av, bv);
      if (cmp !== 0) return q.sortDirection === "asc" ? cmp : -cmp;
      return String(readRecordValue(a, "id") ?? a.symbol).localeCompare(String(readRecordValue(b, "id") ?? b.symbol));
    });
    const { items, nextCursor, hasMore } = paginateArray(sorted, {
      cursor: q.cursor,
      limit: q.limit,
      sortBy: sortKey,
      sortDirection: q.sortDirection,
      idKey: "id",
    });
    return NextResponse.json({
      items,
      nextCursor,
      hasMore,
      total: allCandidates.length,
      origin: {
        source: allCandidates.some((candidate) => isOfflineSnapshot(candidate)) ? "offline_snapshot" : "live_provider",
        fetchedAt: new Date().toISOString(),
      },
    });
  } catch (e: unknown) {
    if (e instanceof ApiError && e.code === "validation_error") {
      return jsonError(e, { legacy: { error: e.message } });
    }
    throw e;
  }
}
