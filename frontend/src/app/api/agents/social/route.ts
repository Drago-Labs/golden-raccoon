import { NextResponse } from "next/server";
import { z } from "zod";
import { withCacheHeaders } from "@/server/cache/strategy";
import { runSocialAgent } from "@/server/agents/social";
import { checkRateLimit } from "@/server/security/rateLimit";

const bodySchema = z.object({
  query: z.string().optional(),
  symbol: z.string().optional(),
  tokenName: z.string().optional(),
  contractAddress: z.string().optional(),
  websiteUrl: z.string().optional(),
  twitterUrl: z.string().optional(),
  telegramUrl: z.string().optional(),
  discordUrl: z.string().optional(),
  dexScreenerPairUrl: z.string().optional(),
  coingeckoId: z.string().optional(),
});

export async function POST(request: Request) {
  const rateLimited = checkRateLimit(request, { namespace: "agent:social", limit: 30, windowMs: 60_000 });

  if (rateLimited) {
    return rateLimited;
  }

  const body = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  return withCacheHeaders(NextResponse.json(await runSocialAgent(parsed.data)), "social");
}
