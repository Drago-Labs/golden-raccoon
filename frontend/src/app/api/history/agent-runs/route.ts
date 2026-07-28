import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { AgentResult } from "@/server/types";
import { withCacheHeaders } from "@/server/cache/strategy";
import { checkRateLimit } from "@/server/security/rateLimit";
import { createAgentRunRecord, listAgentRunRecords } from "@/server/storage";
import {
  chainFamilySchema,
  networkSchema,
  validateChainScopedWallet,
} from "@/server/security/inputValidation";

const targetTokenSchema = z.object({
  symbol: z.string().optional(),
  name: z.string().optional(),
  tokenAddress: z.string().optional(),
  chain: z.string().optional(),
  riskScore: z.number().min(0).max(100).optional(),
  allocationPercent: z.number().min(0).max(100).optional(),
});

const bodySchema = z.object({
  chainFamily: chainFamilySchema.optional(),
  network: networkSchema.optional(),
  walletAddress: z.string().min(1),
  mode: z.enum(["portfolio_review", "token_scan", "pre_buy_check", "holding_review", "execution_prepare"]).optional(),
  inputSnapshot: z.record(z.string(), z.unknown()).optional(),
  targetToken: targetTokenSchema.optional(),
  results: z.array(z.unknown()).min(1),
  userAction: z.enum(["pending", "approved", "rejected", "adjusted", "executed"]).optional(),
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
        chainFamily: parsed.data.chainFamily,
        network: parsed.data.network,
        walletAddress: parsed.data.walletAddress,
        mode: parsed.data.mode,
        inputSnapshot: parsed.data.inputSnapshot,
        targetToken: parsed.data.targetToken,
        results: parsed.data.results as AgentResult[],
        userAction: parsed.data.userAction,
      }),
      { status: 201 },
    ),
    "history",
  );
}
