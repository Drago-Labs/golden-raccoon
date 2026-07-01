import { NextResponse } from "next/server";
import { z } from "zod";
import { runExecutionAgent } from "@/server/agents/execution";

const bodySchema = z.object({
  action: z.string().optional(),
  percent: z.number().min(0).max(100).optional(),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  return NextResponse.json(runExecutionAgent(parsed.data));
}
