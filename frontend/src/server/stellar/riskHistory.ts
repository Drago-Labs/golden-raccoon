import "server-only";

import { createHash } from "node:crypto";
import type { StellarNetworkId } from "@/lib/stellar/config";
import type { RiskRegistryPublication } from "@/server/stellar/riskRegistry";

// ─── Types ───────────────────────────────────────────────────────────────────

export type RiskPublicationRecord = {
  /** Unique record ID. */
  id: string;
  /** Stellar network. */
  network: StellarNetworkId;
  /** Transaction hash. */
  txHash: string;
  /** Publisher G-address. */
  publisher: string;
  /** Asset key (e.g. CODE:ISSUER or contract:...). */
  assetKey: string;
  /** Human-readable asset label. */
  assetLabel: string;
  /** Published risk score (0-100). */
  score: number;
  /** Published verdict symbol. */
  verdict: string;
  /** Canonicalized report JSON hash (hex). */
  reportHash: string;
  /** Whether the publication was verified onchain (SUCCESS). */
  verified: boolean;
  /** Whether the onchain hash matches the local hash. */
  hashMatch?: boolean;
  /** Ledger sequence where the transaction was applied. */
  ledger?: number;
  /** ISO timestamp of publication. */
  publishedAt: string;
  /** ISO timestamp when this record was created. */
  createdAt: string;
};

// ─── Idempotency key ─────────────────────────────────────────────────────────

/**
 * Build a deterministic idempotency key for a risk publication.
 * Uses network + txHash to ensure the same transaction is never recorded twice.
 */
export function riskPublicationIdempotencyKey(network: StellarNetworkId, txHash: string): string {
  const hash = createHash("sha256")
    .update(`risk_publish:${network}:${txHash}`)
    .digest("hex")
    .slice(0, 16);
  return `riskpub_${hash}`;
}

// ─── In-memory history store ─────────────────────────────────────────────────

const historyStore: RiskPublicationRecord[] = [];

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Record a risk publication in the history index.
 * Idempotent: if a record with the same idempotency key already exists,
 * it returns the existing record instead of creating a duplicate.
 */
export function recordRiskPublication(input: {
  network: StellarNetworkId;
  txHash: string;
  publisher: string;
  assetKey: string;
  assetLabel: string;
  score: number;
  verdict: string;
  reportHash: string;
  verified: boolean;
  hashMatch?: boolean;
  ledger?: number;
}): RiskPublicationRecord {
  const id = riskPublicationIdempotencyKey(input.network, input.txHash);

  // Check for existing record (idempotency)
  const existing = historyStore.find((r) => r.id === id);
  if (existing) {
    return existing;
  }

  const record: RiskPublicationRecord = {
    ...input,
    id,
    publishedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };

  historyStore.unshift(record);
  return record;
}

/**
 * List risk publication history, optionally filtered by network.
 */
export function listRiskPublicationHistory(network?: StellarNetworkId): RiskPublicationRecord[] {
  const records = network
    ? historyStore.filter((r) => r.network === network)
    : historyStore;

  return records.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/**
 * Get a risk publication record by transaction hash.
 */
export function getRiskPublicationByTxHash(network: StellarNetworkId, txHash: string): RiskPublicationRecord | undefined {
  const id = riskPublicationIdempotencyKey(network, txHash);
  return historyStore.find((r) => r.id === id);
}

/**
 * Get a risk publication record by its idempotency ID.
 */
export function getRiskPublicationById(id: string): RiskPublicationRecord | undefined {
  return historyStore.find((r) => r.id === id);
}

/**
 * Reset the history store (for testing).
 */
export function resetRiskPublicationHistory(): void {
  historyStore.length = 0;
}

/**
 * Full publish → verify → record flow.
 * Returns the create/updated history record.
 */
export async function publishWithConfirm(
  networkId: StellarNetworkId,
  params: {
    publisher: string;
    assetKey: string;
    assetLabel: string;
    score: number;
    verdict: string;
    evidenceUri: string;
    updatedAt: number;
    report: unknown;
  },
  signTransaction: (xdr: string) => Promise<string>,
): Promise<{
  preview: import("./riskPreview").RiskPublicationPreview;
  verifyResult: import("./riskVerify").VerifyOutcome;
  record: RiskPublicationRecord;
}> {
  const { getRiskPublicationPreview } = await import("./riskPreview");
  const { prepareRiskPublication } = await import("@/server/stellar/riskRegistry");
  const { verifyRiskPublication } = await import("./riskVerify");

  // Step 1: Preview + prepare
  const preview = await getRiskPublicationPreview(networkId, params);

  // Step 2: User signs the XDR (passed in as callback)
  const signedXdr = await signTransaction(preview.xdr);

  // Step 3: Submit to network
  const { submitRiskPublication } = await import("@/server/stellar/riskRegistry");
  const submitted = await submitRiskPublication(networkId, signedXdr);

  // Step 4: Poll to terminal state
  const verifyResult = await verifyRiskPublication(networkId, submitted.hash, {
    localReportHash: preview.reportHash,
    assetKey: params.assetKey,
  });

  // Step 5: Record the result
  const record = recordRiskPublication({
    network: networkId,
    txHash: submitted.hash,
    publisher: params.publisher,
    assetKey: params.assetKey,
    assetLabel: params.assetLabel,
    score: params.score,
    verdict: params.verdict,
    reportHash: preview.reportHash,
    verified: verifyResult.stage === "success",
    hashMatch: verifyResult.hashMatch,
    ledger: verifyResult.ledger,
  });

  return { preview, verifyResult, record };
}
