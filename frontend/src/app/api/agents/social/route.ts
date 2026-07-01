import { NextResponse } from "next/server";
import { z } from "zod";
import { runSocialAgent } from "@/server/agents/social";

const bodySchema = z.object({
  query: z.string().optional(),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  return NextResponse.json(runSocialAgent(parsed.data));
}
