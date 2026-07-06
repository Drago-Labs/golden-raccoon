import { NextResponse } from "next/server";
import { z } from "zod";
import { withCacheHeaders } from "@/server/cache/strategy";
import { runSocialAgent } from "@/server/agents/social";
import { checkRateLimit } from "@/server/security/rateLimit";
import { contractAddressSchema, externalUrlSchema, socialHandleSchema, tokenSymbolSchema } from "@/server/security/inputValidation";

const bodySchema = z.object({
  query: z.union([socialHandleSchema, z.string().min(1).max(80)]).optional(),
  symbol: tokenSymbolSchema,
  tokenName: z.string().min(1).max(120).optional(),
  contractAddress: contractAddressSchema,
  websiteUrl: externalUrlSchema,
  twitterUrl: externalUrlSchema,
  telegramUrl: externalUrlSchema,
  discordUrl: externalUrlSchema,
  dexScreenerPairUrl: externalUrlSchema,
  coingeckoId: z.string().min(1).max(80).optional(),
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
