import { NextResponse } from "next/server";
import { z } from "zod";
import { withCacheHeaders } from "@/server/cache/strategy";
import { assertApprovalOnly } from "@/server/security/policy";
import { checkRateLimit } from "@/server/security/rateLimit";
import { createApprovalRecord, createTransactionRecord, getTransactionRecord } from "@/server/storage";
import { checkSimulationFreshness, checkCalldataMatch, checkParamsMatch, isHighRiskExecution } from "@/server/simulation/freshness";
import type { SimulationResultDetail } from "@/server/types";

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
  simulation: z
    .object({
      simulatedAt: z.string().optional(),
      blockNumber: z.number().optional(),
      ledgerSeq: z.number().optional(),
      quoteExpiry: z.string().optional(),
      calldataHash: z.string().optional(),
      fromAmount: z.string().optional(),
      route: z.array(z.string()).optional(),
      slippageBps: z.number().optional(),
      sequenceNumber: z.union([z.number(), z.string()]).optional(),
      fee: z.string().optional(),
      balanceChanges: z
        .array(
          z.object({
            token: z.string(),
            symbol: z.string(),
            currentBalance: z.string(),
            expectedChange: z.string(),
            direction: z.enum(["inflow", "outflow"]),
          }),
        )
        .optional(),
      allowanceRisk: z
        .array(
          z.object({
            spender: z.string(),
            spenderShort: z.string(),
            token: z.string(),
            currentAllowance: z.string(),
            newAllowance: z.string(),
            isInfinite: z.boolean(),
          }),
        )
        .optional(),
      trustlineRisk: z
        .array(
          z.object({
            asset: z.string(),
            assetShort: z.string(),
            issuer: z.string(),
            issuerShort: z.string(),
            action: z.enum(["add", "remove", "update", "authorize", "deauthorize"]),
            detail: z.string(),
          }),
        )
        .optional(),
      chainFamily: z.enum(["evm", "stellar"]).optional(),
    })
    .optional(),
  currentBlockNumber: z.number().optional(),
  currentLedgerSeq: z.number().optional(),
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

  const highRiskTrade = isHighRiskExecution(parsed.data.action, parsed.data.riskScore);

  if (highRiskTrade && parsed.data.simulationStatus !== "passed") {
    return NextResponse.json({ error: "simulation_required", detail: "High-risk execution confirmation requires a fresh passed simulation." }, { status: 403 });
  }

  if (highRiskTrade && parsed.data.simulation) {
    const simulationDetail: SimulationResultDetail = {
      provider: "planned_tenderly",
      status: parsed.data.simulationStatus ?? "pending",
      checks: [],
      detail: "",
      simulatedAt: parsed.data.simulation.simulatedAt,
      blockNumber: parsed.data.simulation.blockNumber,
      ledgerSeq: parsed.data.simulation.ledgerSeq,
      quoteExpiry: parsed.data.simulation.quoteExpiry,
      calldataHash: parsed.data.simulation.calldataHash,
      fromAmount: parsed.data.simulation.fromAmount,
      route: parsed.data.simulation.route,
      slippageBps: parsed.data.simulation.slippageBps,
      sequenceNumber: parsed.data.simulation.sequenceNumber,
      fee: parsed.data.simulation.fee,
      balanceChanges: parsed.data.simulation.balanceChanges,
      allowanceRisk: parsed.data.simulation.allowanceRisk,
      trustlineRisk: parsed.data.simulation.trustlineRisk,
      chainFamily: parsed.data.simulation.chainFamily,
    };

    const freshness = checkSimulationFreshness(simulationDetail, parsed.data.currentBlockNumber, parsed.data.currentLedgerSeq);

    if (!freshness.fresh) {
      return NextResponse.json({ error: "simulation_stale", detail: freshness.reason, expiredAt: freshness.expiredAt }, { status: 403 });
    }

    const calldataMatch = checkCalldataMatch(simulationDetail, parsed.data.simulation.calldataHash);

    if (!calldataMatch) {
      return NextResponse.json({ error: "simulation_mismatch", detail: "Simulation calldata does not match the current transaction payload. Re-run simulation with the latest parameters." }, { status: 403 });
    }
  }

  if (getTransactionRecord(parsed.data.txHash)) {
    return NextResponse.json({ error: "duplicate_tx_hash", detail: "This transaction hash is already recorded." }, { status: 409 });
  }

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
    status: "confirmed",
    autoExecuted: false,
    approval,
    transaction,
    confirmedAt: new Date().toISOString(),
  }), "execution");
}
