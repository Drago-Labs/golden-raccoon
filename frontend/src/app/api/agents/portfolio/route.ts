import { NextResponse } from "next/server";
import { z } from "zod";
import { withCacheHeaders } from "@/server/cache/strategy";
import { runPortfolioAgent } from "@/server/agents/portfolio";
import { checkRateLimit } from "@/server/security/rateLimit";
import { anyWalletAddressSchema } from "@/server/security/inputValidation";
import { withRouteSpan } from "@/server/observability/tracing/spans";

const bodySchema = z.object({
  walletAddress: anyWalletAddressSchema,
});

export async function POST(request: Request) {
  return withRouteSpan("agent.portfolio", { "http.method": "POST" }, async () => {
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
  });
}
