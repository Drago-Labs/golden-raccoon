import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/server/security/rateLimit";
import { acknowledgeDiscoveryAlert, listDiscoveryAlertsPaginated } from "@/server/storage";
import { parseQuery } from "@/server/api/query/validate";
import { jsonError } from "@/server/api/errors";

const acknowledgeSchema = z.object({
  action: z.literal("acknowledge"),
  alertId: z.string().min(1).max(120),
});

export async function GET(request: Request) {
  const rateLimited = checkRateLimit(request, { namespace: "alerts:list", limit: 60, windowMs: 60_000 });
  if (rateLimited) return rateLimited;
  const url = new URL(request.url);
  try {
    const filterSchema = z.object({
      walletAddress: z.string().min(1).max(80),
      cursor: z.string().optional(),
      limit: z.coerce.number().optional(),
      sortBy: z.string().optional(),
      sortDirection: z.enum(["asc", "desc"]).optional(),
    });
    const raw = Object.fromEntries(url.searchParams.entries());
    // walletAddress is required for this resource; include in raw
    const q = parseQuery(raw, "alerts", filterSchema);
    const wallet = q.walletAddress ?? (q.filters as any).walletAddress;
    if (!wallet) return jsonError({ code: "validation_error", message: "walletAddress required", status: 400 } as any);
    const result = listDiscoveryAlertsPaginated(wallet, { cursor: q.cursor, limit: q.limit, sortBy: q.sortBy, sortDirection: q.sortDirection });
    return NextResponse.json({ items: result.items, nextCursor: result.nextCursor, hasMore: result.hasMore, total: result.total });
  } catch (e: any) {
    if (e.code === "validation_error") return jsonError(e, { legacy: { error: e.message } });
    throw e;
  }
}

export async function POST(request: Request) {
  const rateLimited = checkRateLimit(request, { namespace: "alerts:ack", limit: 30, windowMs: 60_000 });

  if (rateLimited) {
    return rateLimited;
  }

  const body = await request.json().catch(() => ({}));
  const parsed = acknowledgeSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const alert = acknowledgeDiscoveryAlert(parsed.data.alertId);

  if (!alert) {
    return NextResponse.json({ error: "Alert not found" }, { status: 404 });
  }

  return NextResponse.json({ alert });
}
