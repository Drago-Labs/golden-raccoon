import {
  getTransactionRecord,
  updateTransactionRecord,
  createTransactionObservation,
  appendLifecycleEventByName,
} from "@/server/storage";
import { isTransactionHashForChain, type ChainFamily } from "@/lib/chainIdentity";
import { getEvmChainAdapter } from "@/server/transactions/adapters/evm";
import { getStellarChainAdapter } from "@/server/transactions/adapters/stellar";
import { reconcileObservation } from "@/server/transactions/lifecycleManager";
import type {
  TransactionLifecycleStatus,
  TransactionRecord,
  TransactionObservation,
  TransactionExpectedEffect,
} from "@/server/types";

export interface ReconcileOptions {
  network?: string;
  chainFamily?: ChainFamily;
  walletAddress?: string;
  expectedEffects?: TransactionExpectedEffect[];
  confirmationDepth?: number;
  record?: TransactionRecord;
  maxAttempts?: number;
  pollIntervalMs?: number;
}

export interface ReconcileResult {
  hash: string;
  chainFamily: ChainFamily;
  network: string;
  status: TransactionLifecycleStatus;
  reconciled: boolean;
  onChain: boolean;
  confirmations: number;
  finalityReached: boolean;
  blockNumber?: number;
  ledger?: number;
  detail?: string;
  transaction?: TransactionRecord;
}

/**
 * Reconciles an in-flight, dropped, or unknown transaction against on-chain evidence.
 *
 * Replay safety invariant: No code path may re-broadcast a transaction to resolve
 * ambiguous state. Instead, this reconciler polls chain adapters (EVM RPC / Stellar Horizon/RPC)
 * to verify if the transaction reached the mempool, included in a block, reorged, or dropped.
 */
export async function reconcileTransactionAgainstChain(
  hash: string,
  options: ReconcileOptions = {},
): Promise<ReconcileResult> {
  const existingRecord = options.record ?? getTransactionRecord(hash);

  const chainFamily: ChainFamily =
    options.chainFamily ??
    existingRecord?.chainFamily ??
    (isTransactionHashForChain(hash, "stellar") ? "stellar" : "evm");

  const network =
    options.network ??
    existingRecord?.network ??
    (chainFamily === "stellar" ? "stellar-mainnet" : "ethereum");

  const confirmationDepth =
    options.confirmationDepth ??
    existingRecord?.requiredConfirmations ??
    (chainFamily === "stellar" ? 1 : 2);

  let pollResult;
  const expectation = {
    walletAddress: options.walletAddress ?? existingRecord?.walletAddress,
    expectedEffects: options.expectedEffects ?? existingRecord?.expectedEffects,
  };

  if (chainFamily === "stellar") {
    const adapter = getStellarChainAdapter({ network, confirmationDepth });
    pollResult = await adapter.poll(hash, expectation);
  } else {
    const adapter = getEvmChainAdapter({ network, confirmationDepth });
    pollResult = await adapter.poll(hash as `0x${string}`, expectation);
  }

  const observation: TransactionObservation = {
    id: `obs_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    hash,
    evidenceKey: `${hash}:${pollResult.blockNumber ?? pollResult.ledger ?? "none"}:${pollResult.confirmations}`,
    chainFamily,
    network,
    provider: chainFamily === "stellar" ? "stellar_rpc" : "evm_rpc",
    status: pollResult.observationStatus ?? (pollResult.status === "failed" ? "failed" : "included"),
    blockNumber: pollResult.blockNumber ? Number(pollResult.blockNumber) : undefined,
    blockHash: pollResult.blockHash,
    confirmations: pollResult.confirmations,
    requiredConfirmations: pollResult.requiredConfirmations,
    observedAt: pollResult.polledAt ?? new Date().toISOString(),
    detail:
      pollResult.verificationDetail ??
      ("revertReason" in pollResult && typeof (pollResult as { revertReason?: unknown }).revertReason === "string"
        ? (pollResult as { revertReason: string }).revertReason
        : undefined),
  };

  const recordToReconcile: TransactionRecord = existingRecord ?? {
    hash,
    type: "swap",
    asset: "unknown",
    valueUsd: 0,
    status: "submitted",
    lifecycleStatus: "submitted",
    chainFamily,
    network,
    createdAt: new Date().toISOString(),
    submittedAt: new Date().toISOString(),
    pollAttempts: 0,
    observationCount: 0,
  };

  const reconciliation = reconcileObservation(recordToReconcile, observation);

  let updatedRecord: TransactionRecord | undefined;
  if (existingRecord) {
    createTransactionObservation(observation);

    // Apply reconciliation updates
    updatedRecord = updateTransactionRecord(hash, {
      ...reconciliation.updates,
      lifecycleStatus: reconciliation.status,
      status: reconciliation.status,
      reconciled: true,
      lastPolledAt: pollResult.polledAt,
    });

    appendLifecycleEventByName(hash, reconciliation.event, {
      reconciled: true,
      status: reconciliation.status,
      detail: reconciliation.detail,
      confirmations: pollResult.confirmations,
      blockNumber: pollResult.blockNumber ? String(pollResult.blockNumber) : undefined,
      ledger: pollResult.ledger,
    });
  }

  const onChain =
    reconciliation.status === "confirming" ||
    reconciliation.status === "confirmed" ||
    pollResult.status === "confirming" ||
    pollResult.status === "confirmed";

  return {
    hash,
    chainFamily,
    network,
    status: reconciliation.status,
    reconciled: true,
    onChain,
    confirmations: pollResult.confirmations,
    finalityReached: reconciliation.updates.finalityReached ?? false,
    blockNumber: pollResult.blockNumber ? Number(pollResult.blockNumber) : undefined,
    ledger: pollResult.ledger,
    detail: reconciliation.detail,
    transaction: updatedRecord ?? existingRecord,
  };
}
