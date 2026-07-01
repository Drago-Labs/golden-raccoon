import { NextResponse } from "next/server";
import { z } from "zod";
import { buildExecutionPreviewFromPortfolio } from "@/server/agents/execution";
import { getPortfolioSnapshot } from "@/server/portfolio/getPortfolio";

const bodySchema = z.object({
  walletAddress: z.string().optional(),
  action: z.string().optional(),
  fromToken: z.string().optional(),
  toToken: z.string().optional(),
  percent: z.number().min(0).max(100).optional(),
  riskScore: z.number().min(0).max(100).optional(),
  estimatedValueUsd: z.number().min(0).optional(),
  network: z.string().optional(),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { portfolio } = await getPortfolioSnapshot(parsed.data.walletAddress);
  const preview = buildExecutionPreviewFromPortfolio(portfolio, parsed.data);

  return NextResponse.json(preview);
}
