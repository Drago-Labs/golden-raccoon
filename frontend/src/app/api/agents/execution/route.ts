import { NextResponse } from "next/server";
import { z } from "zod";
import { withCacheHeaders } from "@/server/cache/strategy";
import { runExecutionAgent } from "@/server/agents/execution";
import { assertApprovalOnly } from "@/server/security/policy";
import { checkRateLimit } from "@/server/security/rateLimit";
import { getUserRuleRecord } from "@/server/storage";

const bodySchema = z.object({
  action: z.string().optional(),
  walletAddress: z.string().optional(),
  fromToken: z.string().optional(),
  toToken: z.string().optional(),
  percent: z.number().min(0).max(100).optional(),
  riskScore: z.number().min(0).max(100).optional(),
  estimatedValueUsd: z.number().min(0).optional(),
  network: z.string().optional(),
});

export async function POST(request: Request) {
  const rateLimited = checkRateLimit(request, { namespace: "agent:execution", limit: 20, windowMs: 60_000 });

  if (rateLimited) {
    return rateLimited;
  }

  const body = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    assertApprovalOnly({ autoExecute: false });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Execution policy failed" }, { status: 403 });
  }

  const rules = getUserRuleRecord(parsed.data.walletAddress);

  return withCacheHeaders(NextResponse.json(runExecutionAgent({ ...parsed.data, rules })), "execution");
}
