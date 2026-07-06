import { NextResponse } from "next/server";
import { z } from "zod";
import { withCacheHeaders } from "@/server/cache/strategy";
import { runOnchainAgent } from "@/server/agents/onchain";
import { checkRateLimit } from "@/server/security/rateLimit";
import { chainIdSchema, contractAddressSchema } from "@/server/security/inputValidation";

const bodySchema = z.object({
  chain: chainIdSchema,
  contractAddress: contractAddressSchema,
});

export async function POST(request: Request) {
  const rateLimited = checkRateLimit(request, { namespace: "agent:onchain", limit: 20, windowMs: 60_000 });

  if (rateLimited) {
    return rateLimited;
  }

  const body = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  return withCacheHeaders(NextResponse.json(await runOnchainAgent(parsed.data)), "onchain");
}
