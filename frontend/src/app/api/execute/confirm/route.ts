import { NextResponse } from "next/server";
import { z } from "zod";
import { withCacheHeaders } from "@/server/cache/strategy";
import { assertApprovalOnly } from "@/server/security/policy";
import { checkRateLimit } from "@/server/security/rateLimit";
import { createApprovalRecord, createTransactionRecord, getTransactionRecord } from "@/server/storage";
import { getChainFamily, isTransactionHashForChain } from "@/lib/chainIdentity";
import { createStellarRpcServer } from "@/server/stellar/client";
import { checkSimulationFreshness, checkCalldataMatch, checkParamsMatch, isHighRiskExecution, hashCalldata } from "@/server/simulation/freshness";
import type { SimulationResultDetail } from "@/server/types";

/**
 * Confirm a Stellar transaction exists on-chain via RPC before persisting.
 */
async function confirmStellarTransactionOnChain(hash: string, network: string): Promise<{ ok: boolean; detail: string }> {
  try {
    const { server } = createStellarRpcServer(network);
    const txResponse = await server.getTransaction(hash);

    if (!txResponse) {
      return { ok: false, detail: "Transaction not found on Stellar network." };
    }

    if (txResponse.status === "NOT_FOUND") {
      return { ok: false, detail: "Transaction has not yet been included in a Stellar ledger." };
    }

    if (txResponse.status === "FAILED") {
      return { ok: false, detail: "Transaction failed on the Stellar network." };
    }

    return {
      ok: true,
      detail: `Transaction confirmed on Stellar ledger ${txResponse.ledger}.`,
    };
  } catch (error) {
    return {
      ok: false,
      detail: error instanceof Error ? error.message : "Stellar RPC confirmation check failed.",
    };
  }
}

const bodySchema = z.object({
  decisionId: z.string().optional(),
  walletAddress: z.string().min(1),
  decisionWalletAddress: z.string().optional(),
  txHash: z.string().min(1),
  userApproved: z.literal(true),
  network: z.string().optional(),
  action: z.enum(["hold", "watch", "reduce_exposure", "swap_to_stable", "avoid", "manual_review", "prepare_transaction", "create_trustline", "no_action"]).optional(),
  asset: z.string().optional(),
  valueUsd: z.number().min(0).optional(),
  riskScore: z.number().min(0).max(100).optional(),
  simulationStatus: z.enum(["not_required", "pending", "passed", "failed", "unavailable", "unsupported"]).optional(),
  policyAllowed: z.boolean().optional(),
  policyViolations: z.array(z.string()).optional(),
// Stellar-specific confirmation fields
  stellarSequenceNumber: z.string().optional(),
  stellarFeeCharged: z.number().optional(),
  stellarOperationCount: z.number().optional(),
  stellarLedger: z.number().optional(),
  stellarEnvelopeXdr: z.string().optional(),
  stellarResultXdr: z.string().optional(),
  stellarTrustlineAsset: z.string().optional(),
  simulation: z
    .object({
      simulatedTxHash: z.string(),
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
      simulatedXdrHash: z.string().optional(),
      resourceUsage: z
        .object({
          gasUnits: z.string().optional(),
          gasPrice: z.string().optional(),
          networkFee: z.string().optional(),
          operationsCount: z.number().optional(),
          ledgerFee: z.string().optional(),
        })
        .optional(),
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

  currentCalldata: z.string().optional(),
  currentFromAmount: z.string().optional(),
  currentRoute: z.array(z.string()).optional(),
  currentSlippageBps: z.number().optional(),
  currentSequenceNumber: z.union([z.number(), z.string()]).optional(),
  currentFee: z.string().optional(),
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

  // Validate transaction hash format based on network chain family
  const chainFamily = getChainFamily(parsed.data.network);

  if (!isTransactionHashForChain(parsed.data.txHash, chainFamily)) {
    return NextResponse.json({
      error: "invalid_tx_hash",
      detail: `Transaction hash does not match expected format for ${chainFamily} chain. Stellar hashes are 64 hex chars; EVM hashes are 0x-prefixed 64 hex chars.`,
    }, { status: 400 });
  }

  try {
    assertApprovalOnly({ userApproved: parsed.data.userApproved, autoExecute: false });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Execution policy failed" }, { status: 403 });
  }

  if (parsed.data.simulationStatus === "failed") {
    return NextResponse.json({ error: "simulation_failed", detail: "Simulation failed. Confirmation is blocked." }, { status: 403 });
  }

  if (parsed.data.simulationStatus === "unsupported") {
    return NextResponse.json({ error: "simulation_unsupported", detail: "Simulation is not supported for this transaction type or chain. Approval is blocked." }, { status: 403 });
  }

  if (parsed.data.policyAllowed === false) {
    return NextResponse.json({ error: "policy_violation", detail: parsed.data.policyViolations ?? [] }, { status: 403 });
  }

  // Verify signing account matches decision account for Stellar
  const isStellar = getChainFamily(parsed.data.network) === "stellar";
  if (isStellar && parsed.data.decisionWalletAddress && parsed.data.decisionWalletAddress.toUpperCase() !== parsed.data.walletAddress.toUpperCase()) {
    return NextResponse.json({ error: "wallet_mismatch", detail: "Connected Stellar wallet does not match the decision wallet." }, { status: 403 });
  }

  if (parsed.data.decisionWalletAddress && !isStellar && parsed.data.decisionWalletAddress.toLowerCase() !== parsed.data.walletAddress.toLowerCase()) {
    return NextResponse.json({ error: "wallet_mismatch", detail: "Connected wallet does not match the decision wallet." }, { status: 403 });
  }

  const highRiskTrade = isHighRiskExecution(parsed.data.action, parsed.data.riskScore);

  if (highRiskTrade && parsed.data.simulationStatus !== "passed") {
    return NextResponse.json({ error: "simulation_required", detail: "High-risk execution confirmation requires a fresh passed simulation." }, { status: 403 });
  }

  if (highRiskTrade) {
    if (!parsed.data.simulation) {
      return NextResponse.json({ error: "simulation_details_required", detail: "Simulation result data is required for high-risk execution. Provide the full simulation object." }, { status: 403 });
    }

    const simulationDetail: SimulationResultDetail = {
      provider: "planned_tenderly",
      status: parsed.data.simulationStatus ?? "pending",
      checks: [],
      detail: "",
      simulatedTxHash: parsed.data.simulation.simulatedTxHash,
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
      simulatedXdrHash: parsed.data.simulation.simulatedXdrHash,
      balanceChanges: parsed.data.simulation.balanceChanges,
      allowanceRisk: parsed.data.simulation.allowanceRisk,
      trustlineRisk: parsed.data.simulation.trustlineRisk,
      chainFamily: parsed.data.simulation.chainFamily,
    };

    if (parsed.data.txHash !== simulationDetail.simulatedTxHash) {
      return NextResponse.json({ error: "tx_hash_mismatch", detail: "Submitted transaction hash does not match the hash that was simulated. Re-run simulation for this transaction." }, { status: 403 });
    }

    if (isStellar && parsed.data.stellarEnvelopeXdr) {
      if (!simulationDetail.simulatedXdrHash || parsed.data.stellarEnvelopeXdr !== simulationDetail.simulatedXdrHash) {
        return NextResponse.json({ error: "xdr_mismatch", detail: "Submitted Stellar envelope XDR does not match the XDR that was simulated. Re-run simulation for this transaction." }, { status: 403 });
      }
    }

    let serverBlockNumber: number | undefined;
    let serverLedgerSeq: number | undefined;

    if (isStellar) {
      try {
        const { server } = createStellarRpcServer(parsed.data.network);
        const latestLedger = await server.getLatestLedger();
        serverLedgerSeq = latestLedger.sequence;
      } catch {
        return NextResponse.json({ error: "freshness_fetch_failed", detail: "Failed to fetch current ledger sequence from Stellar RPC." }, { status: 503 });
      }
      if (!serverLedgerSeq) {
        return NextResponse.json({ error: "freshness_unverifiable", detail: "Current ledger sequence is required to verify simulation freshness on Stellar." }, { status: 403 });
      }
    } else {
      try {
        const { createEvmPublicClient } = await import("@/server/transactions/adapters/evm");
        const client = createEvmPublicClient({ network: parsed.data.network ?? "goat" });
        if (client) {
          const blockNumber = await client.getBlockNumber();
          serverBlockNumber = Number(blockNumber);
        }
      } catch {
        return NextResponse.json({ error: "freshness_fetch_failed", detail: "Failed to fetch current block number from EVM RPC." }, { status: 503 });
      }
      if (!serverBlockNumber) {
        return NextResponse.json({ error: "freshness_unverifiable", detail: "Current block number is required to verify simulation freshness on EVM." }, { status: 403 });
      }
    }

    const freshness = checkSimulationFreshness(simulationDetail, serverBlockNumber, serverLedgerSeq);

    if (!freshness.fresh) {
      return NextResponse.json({ error: "simulation_stale", detail: freshness.reason, expiredAt: freshness.expiredAt }, { status: 403 });
    }

    if (!isStellar) {
      const currentCalldata = parsed.data.currentCalldata;

      if (!currentCalldata) {
        return NextResponse.json({ error: "calldata_required", detail: "Current calldata is required to verify simulation calldata match for EVM transactions." }, { status: 403 });
      }

      const currentCalldataHash = hashCalldata(currentCalldata);

      const calldataMatch = checkCalldataMatch(simulationDetail, currentCalldataHash);

      if (!calldataMatch) {
        return NextResponse.json({ error: "simulation_mismatch", detail: "Simulation calldata does not match the current transaction payload. Re-run simulation with the latest parameters." }, { status: 403 });
      }
    }

    const paramsMatch = checkParamsMatch(simulationDetail, {
      amount: parsed.data.currentFromAmount,
      route: parsed.data.currentRoute,
      slippageBps: parsed.data.currentSlippageBps,
      sequenceNumber: parsed.data.currentSequenceNumber,
      fee: parsed.data.currentFee,
    });

    if (!paramsMatch) {
      return NextResponse.json({ error: "simulation_params_mismatch", detail: "One or more transaction parameters (amount, route, slippage, sequence, or fee) have changed since simulation. Re-run simulation with current parameters." }, { status: 403 });
    }
  }

  if (getTransactionRecord(parsed.data.txHash)) {
    return NextResponse.json({ error: "duplicate_tx_hash", detail: "This transaction hash is already recorded." }, { status: 409 });
  }

  // Confirm through RPC before persistence (Stellar)
  if (isStellar && parsed.data.network) {
    const onChainConfirmation = await confirmStellarTransactionOnChain(parsed.data.txHash, parsed.data.network);

    if (!onChainConfirmation.ok) {
      return NextResponse.json({
        error: "stellar_rpc_confirmation_failed",
        detail: onChainConfirmation.detail,
      }, { status: 422 });
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
  });
  const txType = parsed.data.action === "create_trustline"
    ? "trustline_create"
    : parsed.data.action === "reduce_exposure" || parsed.data.action === "swap_to_stable" || parsed.data.action === "prepare_transaction"
      ? "swap"
      : "approval";

  const transaction = createTransactionRecord({
    hash: parsed.data.txHash,
    type: txType,
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
    stellarDetails: isStellar ? {
      sequence: parsed.data.stellarSequenceNumber,
      feeCharged: parsed.data.stellarFeeCharged,
      operationCount: parsed.data.stellarOperationCount,
      ledger: parsed.data.stellarLedger,
      envelopeXdr: parsed.data.stellarEnvelopeXdr,
      resultXdr: parsed.data.stellarResultXdr,
      trustlineAsset: parsed.data.stellarTrustlineAsset,
    } : undefined,
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
