import { NextResponse } from "next/server";
import { z } from "zod";
import { runSocialAgent } from "@/server/agents/social";

const bodySchema = z.object({
  query: z.string().optional(),
  symbol: z.string().optional(),
  tokenName: z.string().optional(),
  websiteUrl: z.string().optional(),
  twitterUrl: z.string().optional(),
  telegramUrl: z.string().optional(),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  return NextResponse.json(await runSocialAgent(parsed.data));
}
