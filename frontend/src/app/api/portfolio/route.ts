import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getMockPortfolio } from "@/server/portfolio/mockPortfolio";
import { getRealPortfolio } from "@/server/portfolio/realPortfolio";

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

  if (parsed.data.walletAddress) {
    const realPortfolio = await getRealPortfolio(parsed.data.walletAddress);

    if (realPortfolio) {
      return NextResponse.json(realPortfolio);
    }
  }

  return NextResponse.json(getMockPortfolio(parsed.data.walletAddress));
}
