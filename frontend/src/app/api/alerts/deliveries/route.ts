import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withCacheHeaders } from "@/server/cache/strategy";
import { checkRateLimitProfile } from "@/server/security/rateLimit";
import { listAlertDeliveries } from "@/server/storage";

const querySchema = z.object({
  walletAddress: z.string().optional(),
  alertId: z.string().optional(),
});

export function GET(request: NextRequest) {
  const rateLimited = checkRateLimitProfile(request, "alertRead");
  if (rateLimited) return rateLimited;

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    walletAddress: url.searchParams.get("walletAddress") ?? undefined,
    alertId: url.searchParams.get("alertId") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const wallet = parsed.data.walletAddress?.trim().toLowerCase();

  return withCacheHeaders(NextResponse.json(listAlertDeliveries(parsed.data.alertId, wallet)), "alerts");
}
