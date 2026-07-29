import { NextResponse } from "next/server";
import { z } from "zod";
import { withCacheHeaders } from "@/server/cache/strategy";
import { runTokenScan } from "@/server/scan/tokenScan";
import { checkRateLimit } from "@/server/security/rateLimit";
import { buildServerTimingHeader, createPhaseTimer, recordApiTiming } from "@/server/observability/timing";

const bodySchema = z.object({
  query: z.string().min(1).max(260),
  chain: z.string().min(1).max(40).optional(),
  walletAddress: z.string().min(1).max(80).optional(),
});

const API_TIMING_ROUTE = "scan:token";

export async function POST(request: Request) {
  const requestStartedAt = performance.now();
  const rateLimited = checkRateLimit(request, { namespace: "scan:token", limit: 25, windowMs: 60_000 });

  if (rateLimited) {
    return rateLimited;
  }

  const body = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const timer = createPhaseTimer();
  const result = await runTokenScan(parsed.data.query, parsed.data.chain, parsed.data.walletAddress, timer);
  const timing = timer.finish();

  recordApiTiming(API_TIMING_ROUTE, performance.now() - requestStartedAt);

  const response = withCacheHeaders(NextResponse.json({ ...result, timing }), "scan");
  response.headers.set("Server-Timing", buildServerTimingHeader(timing));

  return response;
}
