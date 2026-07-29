import { NextRequest, NextResponse } from "next/server";
import { withCacheHeaders } from "@/server/cache/strategy";
import { checkRateLimit } from "@/server/security/rateLimit";
import { computeBuyRiskTrend, computePerAgentTrends } from "@/server/storage";

export function GET(request: NextRequest) {
  const rateLimited = checkRateLimit(request, { namespace: "history:trends", limit: 80, windowMs: 60_000 });
  if (rateLimited) return rateLimited;

  const walletAddress = request.nextUrl.searchParams.get("walletAddress") ?? undefined;
  const period = request.nextUrl.searchParams.get("period") ?? "30";
  const limit = Math.min(Math.max(1, parseInt(period, 10) || 30), 200);

  const buyRiskTrend = computeBuyRiskTrend(walletAddress, limit);
  const agentTrends = computePerAgentTrends(walletAddress);

  return withCacheHeaders(
    NextResponse.json({ buyRiskTrend, agentTrends }),
    "history",
  );
}
