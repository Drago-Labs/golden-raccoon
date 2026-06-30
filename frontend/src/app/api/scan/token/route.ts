import { NextResponse } from "next/server";
import { z } from "zod";
import { getMockTokenScan } from "@/server/scan/mockScan";

const bodySchema = z.object({
  query: z.string().min(1).max(120),
  chain: z.string().min(1).max(40).optional(),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  return NextResponse.json(getMockTokenScan(parsed.data.query));
}
