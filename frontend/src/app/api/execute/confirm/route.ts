import { NextResponse } from "next/server";
import { z } from "zod";
import { withCacheHeaders } from "@/server/cache/strategy";
import { assertApprovalOnly } from "@/server/security/policy";
import { checkRateLimit } from "@/server/security/rateLimit";
import { createApprovalRecord, createTransactionRecord, getTransactionRecord } from "@/server/storage";
import { getChainFamily, isStellarAccountAddress, isTransactionHashForChain } from "@/lib/chainIdentity";
import { getDefaultStellarNetwork } from "@/lib/stellar/config";

const evmTxHashPattern = /^0x[a-fA-F0-9]{64}$/;
const stellarTxHashPattern = /^[a-fA-F0-9]{64}$/;

const bodySchema = z.object({
  decisionId: z.string().optional(),
  walletAddress: z.string().min(1),
  decisionWalletAddress: z.string().optional(),
  /** EVM tx hash (0x-prefixed) or Stellar tx hash (64 hex chars). */
  txHash: z.string().min(1, "Transaction hash is required"),
  chainFamily: z.enum(["evm", "stellar"]).optional(),
  userApproved: z.literal(true),
  network: z.string().optional(),
  action: z.enum(["hold", "watch", "reduce_exposure", "swap_to_stable", "avoid", "manual_review", "prepare_transaction", "no_action"]).optional(),
  asset: z.string().optional(),
  valueUsd: z.number().min(0).optional(),
  riskScore: z.number().min(0).max(100).optional(),
  simulationStatus: z.enum(["not_required", "pending", "passed", "failed", "unavailable"]).optional(),
  policyAllowed: z.boolean().optional(),
  policyViolations: z.array(z.string()).optional(),
  /** Expiry from the prepared preview lifecycle */
  preparedAt: z.string().optional(),
  /** Network the wallet was connected to at decision time */
  walletNetwork: z.string().optional(),
  /** Wallet session address */
  sessionAddress: z.string().optional(),
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

  // ─── Block actions that require review — never auto-confirm ───
  if (parsed.data.action === "avoid" || parsed.data.action === "manual_review" || parsed.data.action === "no_action") {
    return NextResponse.json({ error: "action_not_executable", detail: `Action "${parsed.data.action}" is not executable. Only trade actions can be confirmed.` }, { status: 403 });
  }

  // ─── Policy check ───
  try {
    assertApprovalOnly({ userApproved: parsed.data.userApproved, autoExecute: false });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Execution policy failed" }, { status: 403 });
  }

  // ─── Chain family validation ───
  const chainFamily = parsed.data.chainFamily
    ?? getChainFamily(parsed.data.network)
    ?? (isStellarAccountAddress(parsed.data.walletAddress) ? "stellar" : "evm");

  // ─── Validate tx hash format matches chain family ───
  if (chainFamily === "evm" && !evmTxHashPattern.test(parsed.data.txHash)) {
    return NextResponse.json({
      error: "invalid_tx_hash",
      detail: "EVM transaction hash must be 0x-prefixed 64 hex characters.",
    }, { status: 400 });
  }
  if (chainFamily === "stellar" && !stellarTxHashPattern.test(parsed.data.txHash)) {
    return NextResponse.json({
      error: "invalid_tx_hash",
      detail: "Stellar transaction hash must be a 64 hex-character string (without 0x prefix).",
    }, { status: 400 });
  }

  // ─── Wallet / network mismatch checks ───
  if (parsed.data.sessionAddress && parsed.data.sessionAddress.toLowerCase() !== parsed.data.walletAddress.toLowerCase()) {
    return NextResponse.json({ error: "wallet_mismatch", detail: "Connected wallet address does not match the wallet that prepared this transaction. Reconnect and try again." }, { status: 403 });
  }

  if (parsed.data.decisionWalletAddress && parsed.data.decisionWalletAddress.toLowerCase() !== parsed.data.walletAddress.toLowerCase()) {
    return NextResponse.json({ error: "wallet_mismatch", detail: "Connected wallet does not match the decision wallet." }, { status: 403 });
  }

  if (parsed.data.walletNetwork && parsed.data.network) {
    const normalizedWalletNetwork = parsed.data.walletNetwork.trim().toLowerCase();
    const normalizedPlanNetwork = parsed.data.network.trim().toLowerCase();
    if (normalizedWalletNetwork !== normalizedPlanNetwork) {
      return NextResponse.json({
        error: "network_mismatch",
        detail: `Wallet is on "${parsed.data.walletNetwork}" but the prepared transaction is for "${parsed.data.network}". Switch your wallet network.`,
      }, { status: 403 });
    }
  }

  // ─── Simulation failure ───
  if (parsed.data.simulationStatus === "failed") {
    return NextResponse.json({ error: "simulation_failed", detail: "Simulation failed. Confirmation is blocked until the issue is resolved." }, { status: 403 });
  }

  // ─── Policy violation ───
  if (parsed.data.policyAllowed === false) {
    return NextResponse.json({ error: "policy_violation", detail: parsed.data.policyViolations ?? [] }, { status: 403 });
  }

  // ─── Expired plan check ───
  if (parsed.data.preparedAt) {
    const preparedMs = new Date(parsed.data.preparedAt).getTime();
    const elapsedMs = Date.now() - preparedMs;
    const expiryMs = 10 * 60 * 1000; // 10 minutes
    if (elapsedMs > expiryMs) {
      return NextResponse.json({ error: "plan_expired", detail: "This prepared transaction has expired. Please re-run the execution preview to get a fresh plan." }, { status: 403 });
    }
  }

  // ─── High-risk trade requires simulation ───
  const highRiskTrade = (parsed.data.action === "reduce_exposure" || parsed.data.action === "swap_to_stable" || parsed.data.action === "prepare_transaction") && (parsed.data.riskScore ?? 0) >= 50;

  if (highRiskTrade && parsed.data.simulationStatus !== "passed") {
    return NextResponse.json({ error: "simulation_required", detail: "High-risk execution confirmation requires a fresh passed simulation." }, { status: 403 });
  }

  // ─── Duplicate hash ───
  if (getTransactionRecord(parsed.data.txHash)) {
    return NextResponse.json({ error: "duplicate_tx_hash", detail: "This transaction hash is already recorded." }, { status: 409 });
  }

  // ─── Record approval and transaction ───
  const approval = createApprovalRecord({
    walletAddress: parsed.data.walletAddress,
    decisionId: parsed.data.decisionId,
    txHash: parsed.data.txHash,
    network: parsed.data.network ?? "Connected wallet",
    action: parsed.data.action,
    asset: parsed.data.asset ?? "Wallet approval",
    valueUsd: parsed.data.valueUsd ?? 0,
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
    chainFamily,
    status: "confirmed",
    autoExecuted: false,
    approval,
    transaction,
    confirmedAt: new Date().toISOString(),
  }), "execution");
}
