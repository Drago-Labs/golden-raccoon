import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { AgentResult } from "@/server/types";
import { withCacheHeaders } from "@/server/cache/strategy";
import { checkRateLimit } from "@/server/security/rateLimit";
import { createAgentRunRecord, listAgentRunRecords } from "@/server/storage";

const targetTokenSchema = z.object({
  symbol: z.string().optional(),
  name: z.string().optional(),
  tokenAddress: z.string().optional(),
  chain: z.string().optional(),
  riskScore: z.number().min(0).max(100).optional(),
  allocationPercent: z.number().min(0).max(100).optional(),
});

const bodySchema = z.object({
  walletAddress: z.string().min(1),
  targetToken: targetTokenSchema.optional(),
  results: z.array(z.unknown()).min(1),
});

export function GET(request: NextRequest) {
  const rateLimited = checkRateLimit(request, { namespace: "history:agent-runs", limit: 80, windowMs: 60_000 });

  if (rateLimited) {
    return rateLimited;
  }

  const walletAddress = request.nextUrl.searchParams.get("walletAddress") ?? undefined;

  return withCacheHeaders(NextResponse.json(listAgentRunRecords(walletAddress)), "history");
}

export async function POST(request: Request) {
  const rateLimited = checkRateLimit(request, { namespace: "history:agent-runs:create", limit: 30, windowMs: 60_000 });

  if (rateLimited) {
    return rateLimited;
  }

  const body = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  return withCacheHeaders(
    NextResponse.json(
      createAgentRunRecord({
        walletAddress: parsed.data.walletAddress,
        targetToken: parsed.data.targetToken,
        results: parsed.data.results as AgentResult[],
      }),
      { status: 201 },
    ),
    "history",
  );
}
