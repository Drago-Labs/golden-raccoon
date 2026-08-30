import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withCacheHeaders } from "@/server/cache/strategy";
import { checkRateLimitProfile } from "@/server/security/rateLimit";
import { resolveWalletSession } from "@/server/security/walletSession";
import { listAlertDeliveries, listAlerts, listAlertObservations, listAlertRules, summarizeDeliveries } from "@/server/storage";

const querySchema = z.object({
  // Wallet is informational only — the cookie-derived session wallet is
  // authoritative. The query value is allowed to be present for client
  // transparency, but must match the session, otherwise the route rejects
  // the request with 403.
  walletAddress: z.string().min(1).optional(),
  status: z.enum(["triggered", "recovered", "acknowledged"]).optional(),
  limit: z.coerce.number().min(1).max(500).optional(),
});

export function GET(request: NextRequest) {
  const rateLimited = checkRateLimitProfile(request, "alertRead");
  if (rateLimited) return rateLimited;
  const url = new URL(request.url);
  try {
    const { parseQuery } = require("@/server/api/query/validate");
    const { z } = require("zod");
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
    const walletFromQuery = q.walletAddress ?? (q.filters as any).walletAddress;
    const session = resolveWalletSession(request, { suppliedWallet: walletFromQuery });
    if (session.response) return session.response;
    const wallet = session.wallet!;
    // Use paginated helper (storage/index) for alerts
    const { listAlertsPaginated } = require("@/server/storage");
    const page = listAlertsPaginated(wallet, {
      cursor: q.cursor,
      limit: q.limit,
      sortBy: q.sortBy,
      sortDirection: q.sortDirection,
      status: (q.filters as any).status,
    });
    const enriched = page.items.map((alert: any) => {
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
          triggered: enriched.filter((a: any) => a.status === "triggered").length,
          recovered: enriched.filter((a: any) => a.status === "recovered").length,
          acknowledged: enriched.filter((a: any) => a.status === "acknowledged").length,
        },
      }),
      "alerts",
    );
  } catch (e: any) {
    if (e.code === "validation_error") {
      const { jsonError } = require("@/server/api/errors");
      return jsonError(e, { legacy: { error: e.message } });
    }
    throw e;
  }
}
