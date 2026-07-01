import { NextResponse } from "next/server";
import { z } from "zod";
import type { AgentResult } from "@/server/types";
import { withCacheHeaders } from "@/server/cache/strategy";
import { runDecisionAgent } from "@/server/agents/decision";
import { checkRateLimit } from "@/server/security/rateLimit";

const agentResultSchema = z.object({
  agent: z.enum(["portfolio", "news", "social", "onchain", "decision", "execution"]),
  status: z.enum(["idle", "running", "complete", "warning", "error", "unavailable"]),
  score: z.number().min(0).max(100),
  verdict: z.string(),
  summary: z.string(),
  findings: z.array(
    z.object({
      label: z.string(),
      severity: z.enum(["low", "medium", "high", "critical"]),
      detail: z.string(),
    })
  ),
  sources: z.array(
    z.object({
      label: z.string(),
      url: z.string().optional(),
      status: z.enum(["mock", "connected", "unavailable"]),
      detail: z.string().optional(),
    })
  ),
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
  createdAt: z.string(),
});

const bodySchema = z.object({
  results: z.array(agentResultSchema).optional(),
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

  return withCacheHeaders(NextResponse.json(runDecisionAgent({ results: parsed.data.results as AgentResult[] | undefined })), "decision");
}
