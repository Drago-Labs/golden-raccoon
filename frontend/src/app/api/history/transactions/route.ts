import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/server/security/rateLimit";
import { withCacheHeaders } from "@/server/cache/strategy";
import { listTransactionLifecycleEvents, listTransactionObservations, listTransactionRecordsPaginated } from "@/server/storage";
import { attachExplorerUrl } from "@/server/transactions/explorer";
import { getChainFamily } from "@/lib/chainIdentity";
import { parseQuery } from "@/server/api/query/validate";
import { jsonError } from "@/server/api/errors";
import { z } from "zod";

const filterSchemaHT = z.object({
  walletAddress: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().optional(),
  sortBy: z.string().optional(),
  sortDirection: z.enum(["asc", "desc"]).optional(),
  network: z.string().optional(),
  chainFamily: z.enum(["evm", "stellar"]).optional(),
});

export async function GET(request: NextRequest) {
  const rateLimited = checkRateLimit(request, { namespace: "history:transactions", limit: 80, windowMs: 60_000 });
  if (rateLimited) return rateLimited;
  try {
    const raw = Object.fromEntries(request.nextUrl.searchParams.entries());
    const q = parseQuery(raw, "transactions", filterSchemaHT);
    const result = listTransactionRecordsPaginated(q.walletAddress ?? (q.filters as any).walletAddress, {
      cursor: q.cursor,
      limit: q.limit,
      sortBy: q.sortBy,
      sortDirection: q.sortDirection,
      network: q.network ?? (q.filters as any).network,
      chainFamily: q.chainFamily ?? (q.filters as any).chainFamily,
    });
    const items = result.items.map((record) => ({
      ...record,
      events: listTransactionLifecycleEvents(record.hash),
      observations: listTransactionObservations(record.hash),
      finality: {
        confirmations: record.confirmationCount ?? 0,
        required: record.requiredConfirmations ?? 1,
        reached: record.finalityReached ?? false,
      },
      explorerUrl: record.explorerUrl ?? attachExplorerUrl({ hash: record.hash, network: record.network, chainFamily: getChainFamily(record.network) }),
    }));
    return withCacheHeaders(NextResponse.json({ items, nextCursor: result.nextCursor, hasMore: result.hasMore, total: result.total }), "transactions");
  } catch (e: any) {
    if (e.code === "validation_error") return jsonError(e, { legacy: { error: e.message } });
    throw e;
  }
}
