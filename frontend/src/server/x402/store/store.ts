import type { X402ChainFamily } from "@/server/types";
import type { SettlementRecord, SettlementStatus } from "@/server/x402/settlement/types";

export type StoredReceipt = {
  id: string;
  settlementId: string;
  resource: string;
  payer?: string;
  payerRedacted?: string;
  result: unknown;
  resultHash: string;
  issuedAt: string;
  expiresAt: string;
  signature: string;
  redeemedCount: number;
  lastRedeemedAt?: string;
};

export type StoredProof = {
  proofHash: string;
  settlementId: string;
  chainFamily: X402ChainFamily;
  consumedAt: string;
};

export type StoredQuote = {
  id: string;
  resource: string;
  priceUsd: string;
  amount: string;
  asset: string;
  network: string;
  chainFamily: X402ChainFamily;
  payTo: string;
  createdAt: string;
  expiresAt: string;
};

export type StoredUsage = {
  payer: string;
  payerRedacted: string;
  chainFamily: X402ChainFamily;
  totalRequests: number;
  totalSpendByAsset: Record<string, string>;
  settlementsCount: number;
  successfulScans: number;
  failedScans: number;
  lastActiveAt: string;
};

export type X402StoreFilter = {
  payer?: string;
  status?: SettlementStatus;
  owed?: boolean;
  resource?: string;
};

/**
 * Storage contract for x402 settlement, receipts, quote pricing, proof consumption, and payer metering.
 */
export interface X402Store {
  saveSettlement(record: SettlementRecord): Promise<void>;
  getSettlement(idempotencyKey: string): Promise<SettlementRecord | null>;
  getSettlementById(id: string): Promise<SettlementRecord | null>;
  updateSettlement(record: SettlementRecord): Promise<void>;
  listSettlements(filter?: X402StoreFilter): Promise<SettlementRecord[]>;
  hasProof(proofHash: string): Promise<boolean>;
  consumeProof(proofHash: string, settlementId: string, chainFamily: X402ChainFamily): Promise<boolean>;
  saveReceipt(receipt: StoredReceipt): Promise<void>;
  getReceipt(id: string): Promise<StoredReceipt | null>;
  markReceiptRedeemed(id: string): Promise<StoredReceipt>;
  saveQuote(quote: StoredQuote): Promise<void>;
  getQuote(id: string): Promise<StoredQuote | null>;
  recordUsage(payer: string, chainFamily: X402ChainFamily, delta: { amount: string; canonicalAsset: string; success: boolean }): Promise<StoredUsage>;
  getUsage(payer: string): Promise<StoredUsage | null>;
  listUsage(): Promise<StoredUsage[]>;
  clear(): Promise<void>;
}
