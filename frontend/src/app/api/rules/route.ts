import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withCacheHeaders } from "@/server/cache/strategy";
import { assertApprovalOnly } from "@/server/security/policy";
import { checkRateLimit } from "@/server/security/rateLimit";
import { getUserRuleRecord, upsertUserRuleRecord } from "@/server/storage";

const ruleSchema = z.object({
  walletAddress: z.string().min(1),
  maxRiskScore: z.number().min(0).max(100),
  maxTradePercent: z.number().min(0).max(100),
  maxMemeExposurePercent: z.number().min(0).max(100),
  maxDailyTransactionValueUsd: z.number().min(0).optional(),
  maxSlippageBps: z.number().min(0).max(10_000).optional(),
  allowedChains: z.array(z.string().min(1)).optional(),
  blockedTokens: z.array(z.string().min(1)).optional(),
  allowedActions: z
    .array(z.enum(["hold", "watch", "reduce_exposure", "swap_to_stable", "avoid", "manual_review", "prepare_transaction", "no_action"]))
    .optional(),
  autoExecute: z.boolean(),
  version: z.number().int().min(1).optional(),
  createdAt: z.string().optional(),
});

export function GET(request: NextRequest) {
  const rateLimited = checkRateLimit(request, { namespace: "rules", limit: 60, windowMs: 60_000 });

  if (rateLimited) {
    return rateLimited;
  }

  const walletAddress = request.nextUrl.searchParams.get("walletAddress") ?? undefined;
  return withCacheHeaders(NextResponse.json(getUserRuleRecord(walletAddress)), "rules");
}

export async function POST(request: Request) {
  const rateLimited = checkRateLimit(request, { namespace: "rules:update", limit: 20, windowMs: 60_000 });

  if (rateLimited) {
    return rateLimited;
  }

  const body = await request.json().catch(() => ({}));
  const parsed = ruleSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    assertApprovalOnly({ autoExecute: parsed.data.autoExecute });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Execution policy failed" }, { status: 403 });
  }

  return withCacheHeaders(NextResponse.json(upsertUserRuleRecord({
    ...parsed.data,
    autoExecute: false,
    version: parsed.data.version ?? 1,
    createdAt: parsed.data.createdAt ?? new Date().toISOString(),
  })), "rules");
}
