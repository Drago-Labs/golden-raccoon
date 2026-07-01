import { NextResponse } from "next/server";
import { z } from "zod";
import { runNewsAgent } from "@/server/agents/news";

const bodySchema = z.object({
  tokenName: z.string().optional(),
  symbol: z.string().optional(),
  contractAddress: z.string().optional(),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  return NextResponse.json(runNewsAgent(parsed.data));
}
