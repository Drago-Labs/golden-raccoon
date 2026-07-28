import { NextResponse } from "next/server";
import { z } from "zod";
import { withCacheHeaders } from "@/server/cache/strategy";
import { assertApprovalOnly } from "@/server/security/policy";
import { checkRateLimit } from "@/server/security/rateLimit";
import { createApprovalRecord, createTransactionRecord, getTransactionRecord } from "@/server/storage";
import {
  chainFamilySchema,
  networkSchema,
  validateChainScopedTransaction,
  validateChainScopedWallet,
} from "@/server/security/inputValidation";
import { resolveChainContext, sameChainAddress } from "@/lib/chainIdentity";

const bodySchema = z.object({
  chainFamily: chainFamilySchema.optional(),
  decisionId: z.string().optional(),
  walletAddress: z.string().min(1),
  decisionWalletAddress: z.string().optional(),
  txHash: z.string().min(1),
  userApproved: z.literal(true),
  network: networkSchema.optional(),
  action: z.enum(["hold", "watch", "reduce_exposure", "swap_to_stable", "avoid", "manual_review", "prepare_transaction", "no_action"]).optional(),
  asset: z.string().optional(),
  valueUsd: z.number().min(0).optional(),
  riskScore: z.number().min(0).max(100).optional(),
  simulationStatus: z.enum(["not_required", "pending", "passed", "failed", "unavailable"]).optional(),
  policyAllowed: z.boolean().optional(),
  policyViolations: z.array(z.string()).optional(),
}).superRefine((value, context) => {
  if (!validateChainScopedWallet(value)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["walletAddress"],
      message: "Wallet address does not match chainFamily/network.",
    });
  }
  if (!validateChainScopedTransaction(value)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["txHash"],
      message: "Transaction hash does not match chainFamily/network.",
    });
  }
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

  if (parsed.data.simulationStatus === "failed") {
    return NextResponse.json({ error: "simulation_failed", detail: "Simulation failed. Confirmation is blocked." }, { status: 403 });
  }

  if (parsed.data.policyAllowed === false) {
    return NextResponse.json({ error: "policy_violation", detail: parsed.data.policyViolations ?? [] }, { status: 403 });
  }

  const chainContext = resolveChainContext({
    chainFamily: parsed.data.chainFamily,
    network:
      parsed.data.network ??
      (parsed.data.txHash.startsWith("0x") ? "legacy-evm" : "stellar-testnet"),
    identifier: parsed.data.walletAddress,
  });

  if (
    parsed.data.decisionWalletAddress &&
    !sameChainAddress(
      { ...chainContext, address: parsed.data.decisionWalletAddress },
      { ...chainContext, address: parsed.data.walletAddress },
    )
  ) {
    return NextResponse.json(
      { error: "wallet_mismatch", detail: "Connected wallet does not match the decision wallet." },
      { status: 403 },
    );
  }

  const highRiskTrade = (parsed.data.action === "reduce_exposure" || parsed.data.action === "swap_to_stable" || parsed.data.action === "prepare_transaction") && (parsed.data.riskScore ?? 0) >= 50;

  if (highRiskTrade && parsed.data.simulationStatus !== "passed") {
    return NextResponse.json({ error: "simulation_required", detail: "High-risk execution confirmation requires a fresh passed simulation." }, { status: 403 });
  }

  if (getTransactionRecord(parsed.data.txHash, chainContext)) {
    return NextResponse.json({ error: "duplicate_tx_hash", detail: "This transaction hash is already recorded." }, { status: 409 });
  }

  const approval = createApprovalRecord({
    ...chainContext,
    walletAddress: parsed.data.walletAddress,
    decisionId: parsed.data.decisionId,
    txHash: parsed.data.txHash,
    action: parsed.data.action,
    asset: parsed.data.asset ?? "Wallet approval",
    valueUsd: parsed.data.valueUsd ?? 0,
  });
  const transaction = createTransactionRecord({
    ...chainContext,
    hash: parsed.data.txHash,
    type: "approval",
    decisionAction: parsed.data.action,
    asset: parsed.data.asset ?? "Wallet approval",
    valueUsd: parsed.data.valueUsd ?? 0,
    status: "confirmed",
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
    approval,
    transaction,
    confirmedAt: new Date().toISOString(),
  }), "execution");
}
