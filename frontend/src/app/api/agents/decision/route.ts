import { NextResponse } from "next/server";
import { z } from "zod";
import type { AgentResult } from "@/server/types";
import { withCacheHeaders } from "@/server/cache/strategy";
import { runDecisionAgent } from "@/server/agents/decision";
import { checkRateLimit } from "@/server/security/rateLimit";

const agentResultSchema = z.object({
  agent: z.enum(["portfolio", "news", "social", "onchain", "decision", "execution"]),
  status: z.enum(["idle", "running", "complete", "partial", "warning", "error", "unavailable", "blocked"]),
  riskScore: z.number().min(0).max(100).optional(),
  score: z.number().min(0).max(100),
  riskLevel: z.enum(["low", "medium", "high", "critical"]).optional(),
  verdict: z.string(),
  summary: z.string(),
  findings: z.array(
    z.object({
      label: z.string(),
      severity: z.enum(["low", "medium", "high", "critical"]),
      detail: z.string(),
      scoreImpact: z.number().optional(),
      weight: z.number().optional(),
      sourceLabel: z.string().optional(),
      raw: z.string().optional(),
      interpretation: z.string().optional(),
      confidence: z.number().min(0).max(1).optional(),
    })
  ),
  sources: z.array(
    z.object({
      label: z.string(),
      url: z.string().optional(),
      status: z.enum(["mock", "connected", "unavailable"]),
      detail: z.string().optional(),
      checkedAt: z.string().optional(),
      latencyMs: z.number().optional(),
      error: z.string().optional(),
      reliability: z.number().min(0).max(1).optional(),
    })
  ),
  dataQuality: z
    .object({
      mode: z.enum(["live", "partial", "unavailable", "stale", "conflicting"]),
      connectedSources: z.number(),
      unavailableSources: z.number(),
      mockSources: z.number(),
      sourceCount: z.number(),
      reliability: z.number(),
      lastCheckedAt: z.string().optional(),
      detail: z.string(),
    })
    .optional(),
  confidence: z.number().min(0).max(1),
  recommendedAction: z.enum([
    "hold",
    "watch",
    "reduce_exposure",
    "swap_to_stable",
    "avoid",
    "manual_review",
    "prepare_transaction",
    "no_action",
  ]),
  blockingReasons: z.array(z.string()).optional(),
  missingData: z
    .array(
      z.object({
        field: z.string(),
        reason: z.string(),
        impact: z.enum(["low", "medium", "high"]),
        requiredFor: z.string().optional(),
      }),
    )
    .optional(),
  rawSignals: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.string(),
});

const bodySchema = z.object({
  results: z.array(agentResultSchema).optional(),
  context: z
    .object({
      mode: z.enum(["portfolio_review", "token_scan", "pre_buy_check", "holding_review", "execution_prepare"]).optional(),
      userAlreadyOwnsToken: z.boolean().optional(),
      targetExposurePercent: z.number().min(0).max(100).optional(),
      holdingAllocationPercent: z.number().min(0).max(100).optional(),
      stableReservePercent: z.number().min(0).max(100).optional(),
      walletAddress: z.string().optional(),
      tokenSymbol: z.string().optional(),
    })
    .optional(),
  executionReadiness: z
    .object({
      feasible: z.boolean().optional(),
      actionAllowed: z.boolean().optional(),
      blockedReason: z.string().optional(),
      simulationStatus: z.enum(["not_required", "pending", "passed", "failed", "unavailable"]).optional(),
    })
    .optional(),
  userRules: z
    .object({
      walletAddress: z.string().optional(),
      maxRiskScore: z.number().min(0).max(100).optional(),
      maxTradePercent: z.number().min(0).max(100).optional(),
      maxMemeExposurePercent: z.number().min(0).max(100).optional(),
      autoExecute: z.boolean().optional(),
      createdAt: z.string().optional(),
    })
    .optional(),
  userRiskProfile: z
    .object({
      mode: z.enum(["conservative", "balanced", "aggressive", "custom"]).optional(),
      maxRiskScore: z.number().min(0).max(100).optional(),
      maxPortfolioRiskScore: z.number().min(0).max(100).optional(),
      maxSingleTokenExposurePercent: z.number().min(0).max(100).optional(),
      minStableReservePercent: z.number().min(0).max(100).optional(),
    })
    .optional(),
});

export async function POST(request: Request) {
  const rateLimited = checkRateLimit(request, { namespace: "agent:decision", limit: 40, windowMs: 60_000 });

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
      runDecisionAgent({
        results: parsed.data.results as AgentResult[] | undefined,
        context: parsed.data.context,
        executionReadiness: parsed.data.executionReadiness,
        userRules: parsed.data.userRules,
        userRiskProfile: parsed.data.userRiskProfile,
      }),
    ),
    "decision",
  );
}
