import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/server/security/rateLimit";
import { listDiscoveryCandidates } from "@/server/discovery/pipeline";
import { fetchLiveDiscoveryCandidates, isOfflineSnapshot } from "@/server/discovery/sources";

const bodySchema = z.object({
  chain: z.string().min(1).max(64).optional(),
  provider: z.enum(["dexscreener", "stellar_market", "manual"]).default("manual"),
});

export async function POST(request: Request) {
  const rateLimited = checkRateLimit(request, { namespace: "discovery:candidates", limit: 30, windowMs: 60_000 });
  if (rateLimited) return rateLimited;
  const body = await request.json().catch(() => ({}));
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
  const limitRaw = url.searchParams.get("limit") ?? (body as any).limit;
  const cursor = url.searchParams.get("cursor") ?? (body as any).cursor;
  const sortBy = url.searchParams.get("sortBy") ?? (body as any).sortBy;
  const sortDirection = (url.searchParams.get("sortDirection") ?? (body as any).sortDirection) as any;
  try {
    const { parseQuery } = await import("@/server/api/query/validate");
    const { z } = await import("zod");
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
    const q = parseQuery(raw, "discovery", filterSchema as any);
    const { paginateArray } = await import("@/server/api/query/envelope");
    // Sort candidates by score or createdAt for stability
    const sortKey = q.sortBy ?? "score";
    const sorted = [...allCandidates].sort((a: any, b: any) => {
      const av = (a as any)[sortKey] ?? a.score ?? 0;
      const bv = (b as any)[sortKey] ?? b.score ?? 0;
      if (av === bv) return String(a.id ?? a.symbol).localeCompare(String(b.id ?? b.symbol));
      if (q.sortDirection === "asc") return av > bv ? 1 : -1;
      return av < bv ? 1 : -1;
    });
    const { items, nextCursor, hasMore } = paginateArray(sorted as any, {
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
  } catch (e: any) {
    if (e.code === "validation_error") {
      const { jsonError } = await import("@/server/api/errors");
      return jsonError(e, { legacy: { error: e.message } });
    }
    throw e;
  }
}
