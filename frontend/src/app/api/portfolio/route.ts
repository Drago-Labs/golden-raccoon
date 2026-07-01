import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPortfolioSnapshot } from "@/server/portfolio/getPortfolio";

const querySchema = z.object({
  walletAddress: z.string().optional(),
});

export async function GET(request: NextRequest) {
  const parsed = querySchema.safeParse({
    walletAddress: request.nextUrl.searchParams.get("walletAddress") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { portfolio } = await getPortfolioSnapshot(parsed.data.walletAddress);

  return NextResponse.json(portfolio);
}
