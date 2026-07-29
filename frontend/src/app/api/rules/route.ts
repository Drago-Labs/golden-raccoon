import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withCacheHeaders } from "@/server/cache/strategy";
import { assertApprovalOnly } from "@/server/security/policy";
import { checkRateLimit } from "@/server/security/rateLimit";
import { getUserRuleRecord, upsertUserRuleRecord } from "@/server/storage";
import {
  chainFamilySchema,
  networkSchema,
  validateChainScopedWallet,
} from "@/server/security/inputValidation";

const ruleSchema = z.object({
  chainFamily: chainFamilySchema.optional(),
  network: networkSchema.optional(),
  walletAddress: z.string().min(1),
  maxRiskScore: z.number().min(0).max(100),
  maxTradePercent: z.number().min(0).max(100),
  maxMemeExposurePercent: z.number().min(0).max(100),
  maxDailyTransactionValueUsd: z.number().min(0).optional(),
  maxSlippageBps: z.number().min(0).max(10_000).optional(),
  minStableReservePercent: z.number().min(0).max(100).optional(),
  allowedChains: z.array(z.string().min(1)).optional(),
  blockedTokens: z.array(z.string().min(1)).optional(),
  blockedIssuers: z.array(z.string().min(1)).optional(),
  blockedCategories: z.array(z.string().min(1)).optional(),
  allowedActions: z
    .array(z.enum(["hold", "watch", "reduce_exposure", "swap_to_stable", "avoid", "manual_review", "prepare_transaction", "no_action"]))
    .optional(),
  autoExecute: z.boolean(),
  version: z.number().int().min(1).optional(),
  createdAt: z.string().optional(),
}).superRefine((value, context) => {
  if (!validateChainScopedWallet(value)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["walletAddress"],
      message: "Wallet address does not match chainFamily/network.",
    });
  }
});

export function GET(request: NextRequest) {
  const rateLimited = checkRateLimit(request, { namespace: "rules", limit: 60, windowMs: 60_000 });

  if (rateLimited) {
    return rateLimited;
  }

  const walletAddress = request.nextUrl.searchParams.get("walletAddress") ?? undefined;
  const chainFamily = chainFamilySchema.safeParse(
    request.nextUrl.searchParams.get("chainFamily") ?? undefined,
  );
  const network = request.nextUrl.searchParams.get("network") ?? undefined;

  return withCacheHeaders(
    NextResponse.json(
      getUserRuleRecord(walletAddress, {
        chainFamily: chainFamily.success ? chainFamily.data : undefined,
        network,
      }),
    ),
    "rules",
  );
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
    // Only pass version if the client explicitly provided one; otherwise
    // upsertUserRuleRecord auto-increments from the current stored version.
    ...(parsed.data.version !== undefined ? { version: parsed.data.version } : {}),
    createdAt: parsed.data.createdAt ?? new Date().toISOString(),
  })), "rules");
}
