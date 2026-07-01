import { NextResponse } from "next/server";
import { z } from "zod";
import { withCacheHeaders } from "@/server/cache/strategy";
import { runTokenScan } from "@/server/scan/tokenScan";
import { checkRateLimit } from "@/server/security/rateLimit";

const bodySchema = z.object({
  query: z.string().min(1).max(260),
  chain: z.string().min(1).max(40).optional(),
});

export async function POST(request: Request) {
  const rateLimited = checkRateLimit(request, { namespace: "scan:token", limit: 25, windowMs: 60_000 });

  if (rateLimited) {
    return rateLimited;
  }

  const body = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  return withCacheHeaders(NextResponse.json(await runTokenScan(parsed.data.query, parsed.data.chain)), "scan");
}
