import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withCacheHeaders } from "@/server/cache/strategy";
import { getPortfolioSnapshot } from "@/server/portfolio/getPortfolio";
import { checkRateLimit } from "@/server/security/rateLimit";

const querySchema = z.object({
  walletAddress: z.string().optional(),
});

export async function GET(request: NextRequest) {
  const rateLimited = checkRateLimit(request, { namespace: "portfolio", limit: 60, windowMs: 60_000 });

  if (rateLimited) {
    return rateLimited;
  }

  const parsed = querySchema.safeParse({
    walletAddress: request.nextUrl.searchParams.get("walletAddress") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { portfolio } = await getPortfolioSnapshot(parsed.data.walletAddress);

  return withCacheHeaders(NextResponse.json(portfolio), "portfolio");
}
