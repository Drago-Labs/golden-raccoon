import { NextResponse } from "next/server";
import { z } from "zod";
import { withCacheHeaders } from "@/server/cache/strategy";
import { assertApprovalOnly } from "@/server/security/policy";
import { checkRateLimit } from "@/server/security/rateLimit";
import { createApprovalRecord, createTransactionRecord, getTransactionRecord, getSignedIntentByIntentHash, createSignedIntentRecord, updateSignedIntentStatus } from "@/server/storage";
import { verifyExecutionIntentSignature, assertDomainMatch, assertNonceUnique } from "@/server/security/eip712";
import { assertStellarAuthorization, verifyStellarAuthorizationNotExpired } from "@/server/security/stellarAuth";
import type { ExecutionIntent } from "@/server/types";

const bodySchema = z.object({
  decisionId: z.string().optional(),
  walletAddress: z.string().min(1),
  decisionWalletAddress: z.string().optional(),
  txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/, "Expected a wallet-signed transaction hash"),
  userApproved: z.literal(true),
  network: z.string().optional(),
  action: z.enum(["hold", "watch", "reduce_exposure", "swap_to_stable", "avoid", "manual_review", "prepare_transaction", "no_action"]).optional(),
  asset: z.string().optional(),
  valueUsd: z.number().min(0).optional(),
  riskScore: z.number().min(0).max(100).optional(),
  simulationStatus: z.enum(["not_required", "pending", "passed", "failed", "unavailable"]).optional(),
  policyAllowed: z.boolean().optional(),
  policyViolations: z.array(z.string()).optional(),
  intentHash: z.string().optional(),
  executionIntent: z.unknown().optional(),
  stellarAuth: z.unknown().optional(),
});

const usedNonces = new Map<string, Set<number>>();

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

  if (parsed.data.simulationStatus === "failed") {
    return NextResponse.json({ error: "simulation_failed", detail: "Simulation failed. Confirmation is blocked." }, { status: 403 });
  }

  if (parsed.data.policyAllowed === false) {
    return NextResponse.json({ error: "policy_violation", detail: parsed.data.policyViolations ?? [] }, { status: 403 });
  }

  if (parsed.data.decisionWalletAddress && parsed.data.decisionWalletAddress.toLowerCase() !== parsed.data.walletAddress.toLowerCase()) {
    return NextResponse.json({ error: "wallet_mismatch", detail: "Connected wallet does not match the decision wallet." }, { status: 403 });
  }

  const highRiskTrade = (parsed.data.action === "reduce_exposure" || parsed.data.action === "swap_to_stable" || parsed.data.action === "prepare_transaction") && (parsed.data.riskScore ?? 0) >= 50;

  if (highRiskTrade && parsed.data.simulationStatus !== "passed") {
    return NextResponse.json({ error: "simulation_required", detail: "High-risk execution confirmation requires a fresh passed simulation." }, { status: 403 });
  }

  if (getTransactionRecord(parsed.data.txHash)) {
    return NextResponse.json({ error: "duplicate_tx_hash", detail: "This transaction hash is already recorded." }, { status: 409 });
  }

  // Verify EIP-712 execution intent if provided
  let intentRecordId: string | undefined;
  if (parsed.data.executionIntent) {
    try {
      const intent = parsed.data.executionIntent as ExecutionIntent;
      const intentHash = await verifyExecutionIntentSignature(intent);

      assertNonceUnique(intent.payload.nonce, usedNonces, intent.payload.wallet);

      if (intent.payload.wallet.toLowerCase() !== parsed.data.walletAddress.toLowerCase()) {
        return NextResponse.json({ error: "intent_wallet_mismatch", detail: "Signed intent wallet does not match request wallet." }, { status: 403 });
      }

      const existing = getSignedIntentByIntentHash(intentHash);
      if (existing) {
        return NextResponse.json({ error: "duplicate_intent", detail: "This intent hash was already submitted." }, { status: 409 });
      }

      const record = createSignedIntentRecord({
        walletAddress: intent.payload.wallet,
        family: "evm",
        policyHash: intent.payload.policyHash,
        intentHash,
        decisionHash: intent.payload.decisionHash,
        domainChain: `${intent.domain.chainId}`,
        nonce: intent.payload.nonce,
        expiry: intent.payload.expiry,
        status: "approved",
        signature: intent.signature,
      });

      intentRecordId = record.id;
    } catch (error) {
      return NextResponse.json({ error: "intent_verification_failed", detail: error instanceof Error ? error.message : "Invalid execution intent." }, { status: 403 });
    }
  }

  // Verify Stellar authorization if provided
  if (parsed.data.stellarAuth) {
    try {
      const auth = parsed.data.stellarAuth as any;
      assertStellarAuthorization(auth, auth.networkPassphrase);
      verifyStellarAuthorizationNotExpired(auth);

      const existing = getSignedIntentByIntentHash(auth.intentHash);
      if (existing) {
        return NextResponse.json({ error: "duplicate_intent", detail: "This Stellar intent hash was already submitted." }, { status: 409 });
      }

      const record = createSignedIntentRecord({
        walletAddress: auth.sourceAccount,
        family: "stellar",
        policyHash: auth.intentHash,
        intentHash: auth.intentHash,
        decisionHash: auth.intentHash,
        domainChain: auth.networkPassphrase,
        nonce: 0,
        expiry: auth.timeBounds.maxTime,
        status: "approved",
        stellarAuth: auth,
      });

      intentRecordId = record.id;
    } catch (error) {
      return NextResponse.json({ error: "stellar_auth_failed", detail: error instanceof Error ? error.message : "Invalid Stellar authorization." }, { status: 403 });
    }
  }

  const approval = createApprovalRecord({
    walletAddress: parsed.data.walletAddress,
    decisionId: parsed.data.decisionId,
    txHash: parsed.data.txHash,
    network: parsed.data.network ?? "Connected wallet",
    action: parsed.data.action,
    asset: parsed.data.asset ?? "Wallet approval",
    valueUsd: parsed.data.valueUsd ?? 0,
    intentId: intentRecordId,
  });
  const transaction = createTransactionRecord({
    hash: parsed.data.txHash,
    type: "approval",
    decisionAction: parsed.data.action,
    asset: parsed.data.asset ?? "Wallet approval",
    valueUsd: parsed.data.valueUsd ?? 0,
    status: "confirmed",
    network: parsed.data.network ?? "Connected wallet",
    walletAddress: parsed.data.walletAddress,
    userApproved: true,
    decisionId: parsed.data.decisionId,
    simulationStatus: parsed.data.simulationStatus,
    policyStatus: {
      allowed: parsed.data.policyAllowed ?? true,
      violations: parsed.data.policyViolations ?? [],
    },
  });

  return withCacheHeaders(NextResponse.json({
    ...parsed.data,
    status: "confirmed",
    autoExecuted: false,
    intentVerified: Boolean(parsed.data.executionIntent || parsed.data.stellarAuth),
    intentRecordId,
    approval,
    transaction,
    confirmedAt: new Date().toISOString(),
  }), "execution");
}
