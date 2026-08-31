import type { X402ChainFamily } from "@/server/types";

export type SettlementStatus =
  | "required"
  | "submitted"
  | "verified"
  | "served"
  | "failed"
  | "expired"
  | "refunded";

export type SettlementRequest = {
  idempotencyKey: string;
  requestId: string;
  protectedResource: string;
  requestBodyHash: string;
  chainFamily: X402ChainFamily;
  network: string;
  asset: string;
  amount: string;
  payTo: string;
  payer?: string;
  transactionHash?: string;
  expiresAt: string;
  /** Hash/reference only. Raw request payloads are never persisted. */
  payloadRef?: string;
};

export type SettlementRecord = Omit<SettlementRequest, "payer"> & {
  id: string;
  canonicalAsset: string;
  payerRedacted?: string;
  bindingFingerprint: string;
  status: SettlementStatus;
  createdAt: string;
  updatedAt: string;
  failureReason?: string;
  reconciliation?: {
    checkedAt: string;
    transactionHash?: string;
    amount: string;
    canonicalAsset: string;
    network: string;
  };
};

export type SettlementObservation = {
  transactionHash?: string;
  amount: string;
  asset: string;
  network: string;
  chainFamily: X402ChainFamily;
};
