import { NextResponse } from "next/server";
import { z } from "zod";
import { withCacheHeaders } from "@/server/cache/strategy";
import { checkRateLimit } from "@/server/security/rateLimit";
import { TransactionLifecycleError, recordUserRejection } from "@/server/transactions/lifecycleManager";
import { isTransactionHashForChain, getChainFamily } from "@/lib/chainIdentity";

const bodySchema = z.object({
  txHash: z.string().min(1),
  walletAddress: z.string().min(1).optional(),
  decisionWalletAddress: z.string().optional(),
  reason: z.string().max(280).optional(),
  source: z.enum(["wallet", "frontend"]).optional(),
  network: z.string().optional(),
  chainFamily: z.enum(["evm", "stellar"]).optional(),
});

export async function POST(request: Request) {
  const rateLimited = checkRateLimit(request, { namespace: "execute:reject", limit: 30, windowMs: 60_000 });
  if (rateLimited) return rateLimited;

  const body = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const network = parsed.data.network ?? "Connected wallet";
  const chainFamily = parsed.data.chainFamily ?? getChainFamily(network);

  if (!isTransactionHashForChain(parsed.data.txHash, chainFamily)) {
    return NextResponse.json({
      error: "hash_chain_family_mismatch",
      detail: `txHash does not match chain family ${chainFamily} for network ${network}.`,
    }, { status: 400 });
  }

  if (parsed.data.decisionWalletAddress && parsed.data.walletAddress && parsed.data.decisionWalletAddress.toLowerCase() !== parsed.data.walletAddress.toLowerCase()) {
    return NextResponse.json({
      error: "wallet_mismatch",
      detail: "Connected wallet does not match the decision wallet.",
    }, { status: 403 });
  }

  try {
    const transaction = await recordUserRejection(parsed.data.txHash, {
      walletAddress: parsed.data.walletAddress,
      reason: parsed.data.reason,
      source: parsed.data.source ?? "wallet",
    });

    return withCacheHeaders(NextResponse.json({
      success: true,
      status: transaction.lifecycleStatus,
      rejectedAt: transaction.terminalAt,
      transaction,
    }), "execution");
  } catch (error) {
    if (error instanceof TransactionLifecycleError) {
      const status = error.code === "transaction_not_found" ? 404 : error.code === "wallet_mismatch" ? 403 : 400;
      return NextResponse.json({ error: error.code, detail: error.message }, { status });
    }

    return NextResponse.json({
      error: "reject_failed",
      detail: error instanceof Error ? error.message : "Could not record user rejection.",
    }, { status: 500 });
  }
}
