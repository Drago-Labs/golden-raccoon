import { NextResponse } from "next/server";
import { z } from "zod";
import { withCacheHeaders } from "@/server/cache/strategy";
import { runNewsAgent } from "@/server/agents/news";
import { checkRateLimit } from "@/server/security/rateLimit";
import { chainIdSchema, contractAddressSchema, externalUrlSchema, tokenSymbolSchema } from "@/server/security/inputValidation";

const bodySchema = z.object({
  tokenName: z.string().min(1).max(120).optional(),
  symbol: tokenSymbolSchema,
  contractAddress: contractAddressSchema,
  projectName: z.string().min(1).max(120).optional(),
  websiteUrl: externalUrlSchema,
  chain: chainIdSchema,
});

export async function POST(request: Request) {
  const rateLimited = checkRateLimit(request, { namespace: "agent:news", limit: 30, windowMs: 60_000 });

  if (rateLimited) {
    return rateLimited;
  }

  const body = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  return withCacheHeaders(NextResponse.json(await runNewsAgent(parsed.data)), "news");
}
