import { NextResponse } from "next/server";
import { z } from "zod";
import { withCacheHeaders } from "@/server/cache/strategy";
import { assertApprovalOnly } from "@/server/security/policy";
import { checkRateLimit } from "@/server/security/rateLimit";
import {
  appendLifecycleEventByName,
  canonicalizeTransactionHash,
  createApprovalRecord,
  createTransactionRecord,
  getTransactionRecord,
  updateTransactionRecord,
} from "@/server/storage";
import { isTransactionHashForChain, getChainFamily } from "@/lib/chainIdentity";
import { attachExplorerUrl } from "@/server/transactions/explorer";

const bodySchema = z.object({
  decisionId: z.string().optional(),
  walletAddress: z.string().min(1),
  decisionWalletAddress: z.string().optional(),
  chainFamily: z.enum(["evm", "stellar"]).optional(),
  txHash: z.string().min(1),
  userApproved: z.literal(true),
  network: z.string().optional(),
  action: z.enum(["hold", "watch", "reduce_exposure", "swap_to_stable", "avoid", "manual_review", "prepare_transaction", "no_action"]).optional(),
  asset: z.string().optional(),
  valueUsd: z.number().min(0).optional(),
  riskScore: z.number().min(0).max(100).optional(),
  sourceAccount: z.string().optional(),
  simulationStatus: z.enum(["not_required", "pending", "passed", "failed", "unavailable"]).optional(),
  policyAllowed: z.boolean().optional(),
  policyViolations: z.array(z.string()).optional(),
  expectedEffects: z.array(z.object({
    kind: z.enum(["transfer", "swap", "approval", "contract_call", "publish_risk"]),
    fromToken: z.string().optional(),
    toToken: z.string().optional(),
    fromAddress: z.string().optional(),
    toAddress: z.string().optional(),
    amount: z.string().optional(),
    contractAddress: z.string().optional(),
    method: z.string().optional(),
    assetKey: z.string().optional(),
  })).optional(),
  idempotencyKey: z.string().optional(),
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

  if (parsed.data.decisionWalletAddress && parsed.data.decisionWalletAddress.toLowerCase() !== parsed.data.walletAddress.toLowerCase()) {
    return NextResponse.json({ error: "wallet_mismatch", detail: "Connected wallet does not match the decision wallet." }, { status: 403 });
  }

  const highRiskTrade = (parsed.data.action === "reduce_exposure" || parsed.data.action === "swap_to_stable" || parsed.data.action === "prepare_transaction") && (parsed.data.riskScore ?? 0) >= 50;

  if (highRiskTrade && parsed.data.simulationStatus !== "passed") {
    return NextResponse.json({ error: "simulation_required", detail: "High-risk execution confirmation requires a fresh passed simulation." }, { status: 403 });
  }

  const chainFamily = parsed.data.chainFamily ?? (parsed.data.network ? getChainFamily(parsed.data.network) : "evm");
  const network = parsed.data.network ?? "Connected wallet";

  if (!isTransactionHashForChain(parsed.data.txHash, chainFamily)) {
    return NextResponse.json({
      error: "hash_chain_family_mismatch",
      detail: `txHash does not match chain family ${chainFamily} for network ${network}.`,
    }, { status: 400 });
  }

  const normalizedHash = canonicalizeTransactionHash(parsed.data.txHash, chainFamily);

  if (getTransactionRecord(normalizedHash)) {
    return NextResponse.json({ error: "duplicate_tx_hash", detail: "This transaction hash is already recorded." }, { status: 409 });
  }

  if (parsed.data.sourceAccount && chainFamily === "evm" && parsed.data.sourceAccount.toLowerCase() !== parsed.data.walletAddress.toLowerCase()) {
    return NextResponse.json({ error: "source_wallet_mismatch", detail: "EVM source account must equal the connected wallet." }, { status: 403 });
  }

  const policyStatus = {
    allowed: parsed.data.policyAllowed ?? true,
    violations: parsed.data.policyViolations ?? [],
  };

  const approval = createApprovalRecord({
    walletAddress: parsed.data.walletAddress,
    decisionId: parsed.data.decisionId,
    txHash: normalizedHash,
    network,
    action: parsed.data.action,
    asset: parsed.data.asset ?? "Wallet approval",
    valueUsd: parsed.data.valueUsd ?? 0,
  });
  const confirmedAt = new Date().toISOString();
  const transaction = createTransactionRecord({
    hash: normalizedHash,
    type: "approval",
    decisionAction: parsed.data.action,
    asset: parsed.data.asset ?? "Wallet approval",
    valueUsd: parsed.data.valueUsd ?? 0,
    status: "confirmed",
    lifecycleStatus: "confirmed",
    chainFamily,
    network,
    walletAddress: parsed.data.walletAddress,
    sourceAccount: parsed.data.sourceAccount,
    userApproved: true,
    decisionId: parsed.data.decisionId,
    simulationStatus: parsed.data.simulationStatus,
    policyStatus,
    expectedEffects: parsed.data.expectedEffects,
    idempotencyKey: parsed.data.idempotencyKey,
    explorerUrl: attachExplorerUrl({ hash: normalizedHash, network, chainFamily }),
    submittedAt: confirmedAt,
    terminalAt: confirmedAt,
  });

  appendLifecycleEventByName(normalizedHash, "prepared", { network, chainFamily });
  appendLifecycleEventByName(normalizedHash, "submitted", { network, chainFamily });
  appendLifecycleEventByName(normalizedHash, "confirmed", { network, chainFamily, confirmedAt });

  return withCacheHeaders(NextResponse.json({
    ...parsed.data,
    status: "confirmed",
    autoExecuted: false,
    approval,
    transaction,
    confirmedAt,
  }), "execution");
}
