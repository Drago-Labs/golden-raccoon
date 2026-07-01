import { NextResponse } from "next/server";
import { z } from "zod";

const bodySchema = z.object({
  decisionId: z.string().optional(),
  walletAddress: z.string().min(1),
  txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/, "Expected a wallet-signed transaction hash"),
  userApproved: z.literal(true),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  return NextResponse.json({
    ...parsed.data,
    status: "confirmed",
    autoExecuted: false,
    confirmedAt: new Date().toISOString(),
  });
}
