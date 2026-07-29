import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/server/security/rateLimit";
import { withCacheHeaders } from "@/server/cache/strategy";
import { listTransactionLifecycleEvents, listTransactionRecordsPaginated } from "@/server/storage";
import { attachExplorerUrl } from "@/server/transactions/explorer";
import { getChainFamily } from "@/lib/chainIdentity";

export async function GET(request: NextRequest) {
  const rateLimited = checkRateLimit(request, { namespace: "history:transactions", limit: 80, windowMs: 60_000 });
  if (rateLimited) return rateLimited;

  const walletAddress = request.nextUrl.searchParams.get("walletAddress") ?? undefined;
  const cursor = request.nextUrl.searchParams.get("cursor") ?? undefined;
  const limitRaw = request.nextUrl.searchParams.get("limit");
  const limit = limitRaw ? Math.min(Math.max(1, parseInt(limitRaw, 10)), 200) : 50;

  const result = listTransactionRecordsPaginated(walletAddress, { cursor, limit });
  const items = result.items.map((record) => ({
    ...record,
    events: listTransactionLifecycleEvents(record.hash),
    explorerUrl: record.explorerUrl ?? attachExplorerUrl({ hash: record.hash, network: record.network, chainFamily: getChainFamily(record.network) }),
  }));

  return withCacheHeaders(NextResponse.json({ ...result, items }), "transactions");
}
