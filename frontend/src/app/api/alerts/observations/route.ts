import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withCacheHeaders } from "@/server/cache/strategy";
import { checkRateLimitProfile } from "@/server/security/rateLimit";
import { listAlertObservations } from "@/server/storage";

const querySchema = z.object({
  walletAddress: z.string().optional(),
  limit: z.coerce.number().min(1).max(500).optional(),
});

export function GET(request: NextRequest) {
  const rateLimited = checkRateLimitProfile(request, "alertRead");
  if (rateLimited) return rateLimited;

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    walletAddress: url.searchParams.get("walletAddress") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const wallet = parsed.data.walletAddress?.trim().toLowerCase();

  return withCacheHeaders(NextResponse.json(listAlertObservations(wallet, parsed.data.limit ?? 100)), "alerts");
}
