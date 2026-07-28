import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withCacheHeaders } from "@/server/cache/strategy";
import { checkRateLimitProfile } from "@/server/security/rateLimit";
import { listAlertDeliveries, listAlerts, listAlertObservations, listAlertRules, summarizeDeliveries } from "@/server/storage";

const querySchema = z.object({
  walletAddress: z.string().min(1).optional(),
  status: z.enum(["triggered", "recovered", "acknowledged"]).optional(),
  limit: z.coerce.number().min(1).max(500).optional(),
});

export function GET(request: NextRequest) {
  const rateLimited = checkRateLimitProfile(request, "alertRead");
  if (rateLimited) return rateLimited;

  const url = new URL(request.url);
  const raw = {
    walletAddress: url.searchParams.get("walletAddress") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  };
  const parsed = querySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const wallet = parsed.data.walletAddress?.trim().toLowerCase();
  const alerts = listAlerts(wallet, parsed.data.status, parsed.data.limit);
  const enriched = alerts.map((alert) => {
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
      alerts: enriched,
      counts: {
        triggered: enriched.filter((alert) => alert.status === "triggered").length,
        recovered: enriched.filter((alert) => alert.status === "recovered").length,
        acknowledged: enriched.filter((alert) => alert.status === "acknowledged").length,
      },
    }),
    "alerts",
  );
}
