import { NextResponse } from "next/server";
import { z } from "zod";
import { withCacheHeaders } from "@/server/cache/strategy";
import { assertApprovalOnly } from "@/server/security/policy";
import { checkRateLimit } from "@/server/security/rateLimit";
import { createApprovalRecord, createTransactionRecord } from "@/server/storage";

const bodySchema = z.object({
  decisionId: z.string().optional(),
  walletAddress: z.string().min(1),
  txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/, "Expected a wallet-signed transaction hash"),
  userApproved: z.literal(true),
  network: z.string().optional(),
  asset: z.string().optional(),
  valueUsd: z.number().min(0).optional(),
});

export async function POST(request: Request) {
  const rateLimited = checkRateLimit(request, { namespace: "execute:confirm", limit: 20, windowMs: 60_000 });

  if (rateLimited) {
    return rateLimited;
  }

  const body = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    assertApprovalOnly({ userApproved: parsed.data.userApproved, autoExecute: false });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Execution policy failed" }, { status: 403 });
  }

  const approval = createApprovalRecord({
    walletAddress: parsed.data.walletAddress,
    decisionId: parsed.data.decisionId,
    txHash: parsed.data.txHash,
  });
  const transaction = createTransactionRecord({
    hash: parsed.data.txHash,
    type: "approval",
    asset: parsed.data.asset ?? "Wallet approval",
    valueUsd: parsed.data.valueUsd ?? 0,
    status: "confirmed",
    network: parsed.data.network ?? "Connected wallet",
    walletAddress: parsed.data.walletAddress,
    userApproved: true,
    decisionId: parsed.data.decisionId,
  });

  return withCacheHeaders(NextResponse.json({
    ...parsed.data,
    status: "confirmed",
    autoExecuted: false,
    approval,
    transaction,
    confirmedAt: new Date().toISOString(),
  }), "execution");
}
