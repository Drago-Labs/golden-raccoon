import { NextResponse } from "next/server";
import { z } from "zod";
import { withCacheHeaders } from "@/server/cache/strategy";
import { buildExecutionPreviewFromPortfolio } from "@/server/agents/execution";
import { getPortfolioSnapshot } from "@/server/portfolio/getPortfolio";
import { assertApprovalOnly } from "@/server/security/policy";
import { checkRateLimit } from "@/server/security/rateLimit";
import { getUserRuleRecord } from "@/server/storage";

const simulationDetailSchema = z
  .object({
    simulatedAt: z.string().optional(),
    blockNumber: z.number().optional(),
    ledgerSeq: z.number().optional(),
    quoteExpiry: z.string().optional(),
    calldataHash: z.string().optional(),
    fromAmount: z.string().optional(),
    route: z.array(z.string()).optional(),
    slippageBps: z.number().optional(),
    sequenceNumber: z.union([z.number(), z.string()]).optional(),
    fee: z.string().optional(),
    balanceChanges: z
      .array(
        z.object({
          token: z.string(),
          symbol: z.string(),
          currentBalance: z.string(),
          expectedChange: z.string(),
          direction: z.enum(["inflow", "outflow"]),
        }),
      )
      .optional(),
    allowanceRisk: z
      .array(
        z.object({
          spender: z.string(),
          spenderShort: z.string(),
          token: z.string(),
          currentAllowance: z.string(),
          newAllowance: z.string(),
          isInfinite: z.boolean(),
        }),
      )
      .optional(),
    trustlineRisk: z
      .array(
        z.object({
          asset: z.string(),
          assetShort: z.string(),
          issuer: z.string(),
          issuerShort: z.string(),
          action: z.enum(["add", "remove", "update", "authorize", "deauthorize"]),
          detail: z.string(),
        }),
      )
      .optional(),
    chainFamily: z.enum(["evm", "stellar"]).optional(),
  })
  .optional();

const bodySchema = z.object({
  walletAddress: z.string().optional(),
  action: z.string().optional(),
  decisionId: z.string().optional(),
  fromToken: z.string().optional(),
  toToken: z.string().optional(),
  percent: z.number().min(0).max(100).optional(),
  riskScore: z.number().min(0).max(100).optional(),
  estimatedValueUsd: z.number().min(0).optional(),
  network: z.string().optional(),
  slippageBps: z.number().min(0).max(10_000).optional(),
  priceImpactBps: z.number().min(0).optional(),
  gasEstimateUsd: z.number().min(0).optional(),
  quoteAvailable: z.boolean().optional(),
  expectedOutputAmount: z.number().min(0).optional(),
  simulationStatus: z.enum(["not_required", "pending", "passed", "failed", "unavailable"]).optional(),
  simulationRevertReason: z.string().optional(),
  simulation: simulationDetailSchema,
});

export async function POST(request: Request) {
  const rateLimited = checkRateLimit(request, { namespace: "execute:prepare", limit: 20, windowMs: 60_000 });

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

  const { portfolio } = await getPortfolioSnapshot(parsed.data.walletAddress);
  const rules = getUserRuleRecord(parsed.data.walletAddress ?? portfolio.walletAddress);
  const preview = await buildExecutionPreviewFromPortfolio(portfolio, { ...parsed.data, rules });

  return withCacheHeaders(NextResponse.json(preview), "execution");
}
