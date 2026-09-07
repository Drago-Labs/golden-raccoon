import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withCacheHeaders } from "@/server/cache/strategy";
import { checkRateLimitProfile } from "@/server/security/rateLimit";
import { resolveWalletSession } from "@/server/security/walletSession";
import { listAlertDeliveries, listAlertObservations, listAlertRules, listAlertsPaginated, summarizeDeliveries } from "@/server/storage";
import { parseQuery } from "@/server/api/query/validate";
import { ApiError, jsonError } from "@/server/api/errors";

export function GET(request: NextRequest) {
  const rateLimited = checkRateLimitProfile(request, "alertRead");
  if (rateLimited) return rateLimited;
  const url = new URL(request.url);
  try {
    const filterSchema = z.object({
      walletAddress: z.string().optional(),
      status: z.enum(["triggered", "recovered", "acknowledged"]).optional(),
      cursor: z.string().optional(),
      limit: z.coerce.number().optional(),
      sortBy: z.string().optional(),
      sortDirection: z.enum(["asc", "desc"]).optional(),
    });
    const raw: Record<string, unknown> = Object.fromEntries(url.searchParams.entries());
    const q = parseQuery(raw, "alerts", filterSchema);
    const walletFromQuery = q.walletAddress ?? q.filters.walletAddress;
    const session = resolveWalletSession(request, { suppliedWallet: walletFromQuery });
    if (session.response) return session.response;
    const wallet = session.wallet!;
    // Use paginated helper (storage/index) for alerts
    const page = listAlertsPaginated(wallet, {
      cursor: q.cursor,
      limit: q.limit,
      sortBy: q.sortBy,
      sortDirection: q.sortDirection,
      status: q.filters.status,
    });
    const enriched = page.items.map((alert) => {
      const deliveries = listAlertDeliveries(alert.id, wallet);
      const observations = listAlertObservations(wallet).filter((entry) => entry.observationKey === alert.observationKey);
      const matchingRules = listAlertRules(wallet).filter((rule) => rule.id === alert.ruleId);
      return {
        ...alert,
        deliverySummary: summarizeDeliveries(deliveries),
        deliveryCount: deliveries.length,
        observableHistoryCount: observations.length,
        matchingRule: matchingRules[0] ?? null,
      };
    });
    return withCacheHeaders(
      NextResponse.json({
        walletAddress: wallet,
        items: enriched,
        nextCursor: page.nextCursor,
        hasMore: page.hasMore,
        total: page.total,
        counts: {
          triggered: enriched.filter((a) => a.status === "triggered").length,
          recovered: enriched.filter((a) => a.status === "recovered").length,
          acknowledged: enriched.filter((a) => a.status === "acknowledged").length,
        },
      }),
      "alerts",
    );
  } catch (e: unknown) {
    if (e instanceof ApiError && e.code === "validation_error") {
      return jsonError(e, { legacy: { error: e.message } });
    }
    throw e;
  }
}
