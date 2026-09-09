import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "@/server/api/errors";
import { gateFeature } from "@/server/features/evaluator";
import { runTokenScan } from "@/server/scan/tokenScan";
import { checkRateLimit } from "@/server/security/rateLimit";
import { createX402PaymentReceipt } from "@/server/storage";
import { getX402RuntimeConfig } from "@/server/x402/config";
import { hashPaymentHeader, stableJsonHash } from "@/server/x402/guards";
import { stellarSettlementContract } from "@/server/x402/settlement/contract";
import type { SettlementRequest } from "@/server/x402/settlement/types";

export const runtime = "nodejs";

const querySchema = z.object({
  query: z.string().min(1).max(260),
  chain: z.string().min(1).max(40).optional(),
  walletAddress: z.string().min(1).max(80).optional(),
  paymentProof: z.string().min(1),
});

interface StellarPaymentProofPayload {
  network?: string;
  sourceAccount?: string;
  destinationAccount?: string;
  amount?: string;
  assetCode?: string;
  transactionHash?: string;
  timestamp?: number;
}

function verifyStellarPaymentProof(proof: Record<string, unknown>): { payer: string; network: string } {
  const p = proof as StellarPaymentProofPayload;

  if (!p.sourceAccount || !/^G[A-Z2-7]{55}$/.test(p.sourceAccount)) {
    throw new Error("Invalid or missing Stellar source account.");
  }

  const validNetworks = ["stellar:testnet", "stellar:pubnet", "testnet", "pubnet"];
  if (!p.network || !validNetworks.includes(p.network)) {
    throw new Error("Invalid or unsupported Stellar network.");
  }

  const normalizedNetwork = p.network.startsWith("stellar:") ? p.network : `stellar:${p.network}`;

  if (p.destinationAccount) {
    const config = getX402RuntimeConfig();
    const expectedPayTo = config.stellarPayTo;
    if (expectedPayTo && p.destinationAccount !== expectedPayTo) {
      throw new Error("Payment destination does not match the configured pay-to account.");
    }
  }

  if (p.assetCode && p.assetCode !== "USDC") {
    throw new Error(`Unsupported payment asset: expected USDC, got ${p.assetCode}.`);
  }

  if (p.timestamp) {
    const ageSeconds = (Date.now() - p.timestamp) / 1000;
    if (ageSeconds > 300) {
      throw new Error("Payment proof has expired.");
    }
  }

  return { payer: p.sourceAccount, network: normalizedNetwork };
}

/**
 * Handles Stellar x402 payment presentations for deep scans.
 */
export async function GET(request: NextRequest): Promise<NextResponse<unknown>> {
  const rateLimited = checkRateLimit(request, {
    namespace: "x402:stellar-deep-scan",
    limit: 10,
    windowMs: 60_000,
  });

  if (rateLimited) {
    return rateLimited;
  }

  const config = getX402RuntimeConfig();

  if (!config.stellarEnabled) {
    return jsonError({
      code: "stellar_disabled",
      message: "Stellar x402 payments are not enabled. Set X402_STELLAR_ENABLED=1 and X402_STELLAR_PAY_TO to a valid G... address.",
      status: 402,
    });
  }

  const parsed = querySchema.safeParse({
    query: request.nextUrl.searchParams.get("query") ?? "",
    chain: request.nextUrl.searchParams.get("chain") ?? undefined,
    walletAddress: request.nextUrl.searchParams.get("walletAddress") ?? undefined,
    paymentProof: request.headers.get("x-stellar-payment-proof") ?? "",
  });

  if (!parsed.success) {
    return jsonError({ code: "validation_error", message: "Invalid input", status: 400, details: parsed.error.flatten() });
  }

  const x402Gate = gateFeature("x402_stellar_deep_scan", parsed.data.walletAddress ?? "");
  if (!x402Gate.enabled) {
    return NextResponse.json(
      { error: "feature_disabled", feature: "x402_stellar_deep_scan", detail: x402Gate.detail },
      { status: 403 },
    );
  }

  let proof: Record<string, unknown>;
  try {
    const decoded = Buffer.from(parsed.data.paymentProof, "base64").toString("utf-8");
    proof = JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return jsonError({
      code: "invalid_payment_proof",
      message: "The x-stellar-payment-proof header must be a valid base64-encoded JSON object.",
      status: 400,
    });
  }

  let verification: { payer: string; network: string };
  try {
    verification = verifyStellarPaymentProof(proof);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Payment proof verification failed.";
    return jsonError({ code: "payment_proof_rejected", message, status: 402 });
  }

  const paymentHeaderHash = hashPaymentHeader(parsed.data.paymentProof);
  const requestBody = { query: parsed.data.query, chain: parsed.data.chain, walletAddress: parsed.data.walletAddress };
  const idempotencyKey = `${config.protectedResource}:stellar:${paymentHeaderHash.slice(0, 16)}`;
  const quoteId = request.headers.get("x-quote-id") ?? undefined;

  const settlementRequest: SettlementRequest = {
    idempotencyKey,
    requestId: idempotencyKey,
    protectedResource: config.protectedResource,
    requestBodyHash: stableJsonHash(requestBody),
    chainFamily: "stellar",
    network: verification.network,
    asset: config.stellarUsdcContract ?? "USDC",
    amount: config.priceUsd.replace(/^\$/, ""),
    payTo: config.stellarPayTo ?? "",
    payer: verification.payer,
    expiresAt: new Date(Date.now() + config.paymentExpirySeconds * 1000).toISOString(),
    priceQuoted: config.priceUsd,
  };

  const { record: initialRecord } = await stellarSettlementContract.begin(settlementRequest, quoteId);

  try {
    await stellarSettlementContract.consumeProof(parsed.data.paymentProof, initialRecord.id);
  } catch {
    return jsonError({
      code: "duplicate_payment",
      message: "This Stellar payment proof was already used.",
      status: 409,
    });
  }

  createX402PaymentReceipt({
    requestId: idempotencyKey,
    paymentHeaderHash,
    walletAddress: parsed.data.walletAddress,
    network: verification.network,
    asset: "USDC",
    amount: config.priceUsd,
    priceUsd: config.priceUsd,
    payTo: config.stellarPayTo,
    facilitatorUrl: config.facilitatorUrl,
    protectedResource: config.protectedResource,
    requestBodyHash: stableJsonHash(requestBody),
    payer: verification.payer,
    verificationStatus: "verified",
  });

  let scan: unknown;
  try {
    scan = await runTokenScan(parsed.data.query, parsed.data.chain, parsed.data.walletAddress);
  } catch (err) {
    await stellarSettlementContract.recordWorkFailure(
      idempotencyKey,
      err instanceof Error ? err.message : "Token scan execution failed",
    );
    throw err;
  }

  const { record: completedRecord, receipt: verifiableReceipt } = await stellarSettlementContract.deliverWork(
    idempotencyKey,
    config.protectedResource,
    scan,
    verification.payer,
  );

  return NextResponse.json({
    premium: {
      unlocked: true,
      tier: "deep_scan",
      provider: "x402_stellar",
      protectedResource: config.protectedResource,
      receiptId: verifiableReceipt.id,
      note: "Stellar x402 payment was verified before premium analysis ran.",
    },
    receipt: verifiableReceipt,
    settlement: completedRecord,
    scan,
  });
}
