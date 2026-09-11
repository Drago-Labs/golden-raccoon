import { NextRequest, NextResponse } from "next/server";
import { withX402 } from "@x402/next";
import { z } from "zod";
import { jsonError } from "@/server/api/errors";
import { runTokenScan } from "@/server/scan/tokenScan";
import { checkRateLimit } from "@/server/security/rateLimit";
import { createX402PaymentReceipt } from "@/server/storage";
import { getX402RouteConfig, getX402RuntimeConfig } from "@/server/x402/config";
import { assertFreshX402Payment } from "@/server/x402/guards";
import { createX402ResourceServer } from "@/server/x402/server";
import { evmSettlementContract } from "@/server/x402/settlement/contract";
import type { SettlementRequest } from "@/server/x402/settlement/types";

export const runtime = "nodejs";

const querySchema = z.object({
  query: z.string().min(1).max(260),
  chain: z.string().min(1).max(40).optional(),
  walletAddress: z.string().min(1).max(80).optional(),
});

async function deepScanHandler(request: NextRequest): Promise<NextResponse<unknown>> {
  const rateLimited = checkRateLimit(request, { namespace: "x402:deep-scan", limit: 10, windowMs: 60_000 });

  if (rateLimited) {
    return rateLimited;
  }

  const config = getX402RuntimeConfig();
  const parsed = querySchema.safeParse({
    query: request.nextUrl.searchParams.get("query") ?? "",
    chain: request.nextUrl.searchParams.get("chain") ?? undefined,
    walletAddress: request.nextUrl.searchParams.get("walletAddress") ?? undefined,
  });

  if (!parsed.success) {
    return jsonError({ code: "validation_error", message: "Invalid input", status: 400, details: parsed.error.flatten() });
  }

  const guard = await assertFreshX402Payment({ request, requestBody: parsed.data, config });

  if (!guard.ok) {
    return jsonError({ code: guard.error as any, message: guard.detail, status: guard.status, legacy: { receiptId: guard.receiptId } });
  }

  const settlementRequest: SettlementRequest = {
    idempotencyKey: guard.requestId,
    requestId: guard.requestId,
    protectedResource: config.protectedResource,
    requestBodyHash: guard.requestBodyHash,
    chainFamily: "evm",
    network: guard.paymentDetails.network,
    asset: guard.paymentDetails.asset,
    amount: guard.paymentDetails.amount,
    payTo: guard.paymentDetails.recipient,
    payer: guard.paymentDetails.payer,
    transactionHash: guard.paymentDetails.transactionHash,
    expiresAt: guard.paymentDetails.settlementTimestamp
      ? new Date(new Date(guard.paymentDetails.settlementTimestamp).getTime() + config.paymentExpirySeconds * 1000).toISOString()
      : new Date(Date.now() + config.paymentExpirySeconds * 1000).toISOString(),
    priceQuoted: guard.paymentDetails.amount,
  };

  const { record: initialRecord } = await evmSettlementContract.begin(settlementRequest, guard.quoteId);

  try {
    await evmSettlementContract.consumeProof(guard.paymentSignature, initialRecord.id);
  } catch {
    return jsonError({
      code: "duplicate_payment",
      message: "Payment proof has already been consumed.",
      status: 409,
    });
  }

  createX402PaymentReceipt({
    requestId: guard.requestId,
    paymentHeaderHash: guard.paymentHeaderHash,
    walletAddress: parsed.data.walletAddress,
    network: guard.paymentDetails.network,
    asset: guard.paymentDetails.asset,
    amount: guard.paymentDetails.amount,
    priceUsd: config.priceUsd,
    payTo: config.payTo,
    facilitatorUrl: config.facilitatorUrl,
    protectedResource: config.protectedResource,
    requestBodyHash: guard.requestBodyHash,
    verificationStatus: "verified",
    chainFamily: guard.paymentDetails.chainFamily,
    payer: guard.paymentDetails.payer,
    transactionHash: guard.paymentDetails.transactionHash,
    paymentExpiry: guard.paymentDetails.settlementTimestamp
      ? new Date(Date.now() + config.paymentExpirySeconds * 1000).toISOString()
      : undefined,
  });

  let scan: unknown;
  try {
    scan = await runTokenScan(parsed.data.query, parsed.data.chain, parsed.data.walletAddress);
  } catch (err) {
    await evmSettlementContract.recordWorkFailure(
      guard.requestId,
      err instanceof Error ? err.message : "Token scan execution failed",
    );
    throw err;
  }

  const { record: completedRecord, receipt: verifiableReceipt } = await evmSettlementContract.deliverWork(
    guard.requestId,
    config.protectedResource,
    scan,
    guard.paymentDetails.payer,
  );

  return NextResponse.json({
    premium: {
      unlocked: true,
      tier: "deep_scan",
      provider: "x402",
      protectedResource: config.protectedResource,
      receiptId: verifiableReceipt.id,
      chainFamily: config.chainFamily,
      note: "x402 payment was verified before premium analysis ran. Settlement is handled by the x402 resource server after this successful response.",
    },
    receipt: verifiableReceipt,
    settlement: completedRecord,
    scan,
  });
}

const x402Server = createX402ResourceServer();

export const GET = withX402(deepScanHandler, getX402RouteConfig(), x402Server);
