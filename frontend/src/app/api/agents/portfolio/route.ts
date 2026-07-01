import { NextResponse } from "next/server";
import { z } from "zod";
import { runPortfolioAgent } from "@/server/agents/portfolio";

const bodySchema = z.object({
  walletAddress: z.string().optional(),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  return NextResponse.json(await runPortfolioAgent(parsed.data.walletAddress));
}
