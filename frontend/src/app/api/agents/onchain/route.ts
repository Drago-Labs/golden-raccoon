import { NextResponse } from "next/server";
import { z } from "zod";
import { runOnchainAgent } from "@/server/agents/onchain";

const bodySchema = z.object({
  chain: z.string().optional(),
  contractAddress: z.string().optional(),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  return NextResponse.json(await runOnchainAgent(parsed.data));
}
