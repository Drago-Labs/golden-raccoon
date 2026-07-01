import { NextResponse } from "next/server";
import { z } from "zod";
import { withCacheHeaders } from "@/server/cache/strategy";
import { runPortfolioAgent } from "@/server/agents/portfolio";
import { checkRateLimit } from "@/server/security/rateLimit";

const bodySchema = z.object({
  walletAddress: z.string().optional(),
});

export async function POST(request: Request) {
  const rateLimited = checkRateLimit(request, { namespace: "agent:portfolio", limit: 30, windowMs: 60_000 });

  if (rateLimited) {
    return rateLimited;
  }

  const body = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  return withCacheHeaders(NextResponse.json(await runPortfolioAgent(parsed.data.walletAddress)), "portfolio");
}
