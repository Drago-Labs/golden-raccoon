import { createHash, randomUUID } from "node:crypto";
import type { X402ChainFamily } from "@/server/types";
import type { SettlementObservation, SettlementRecord, SettlementRequest, SettlementStatus } from "@/server/x402/settlement/types";

const TRANSITIONS: Record<SettlementStatus, SettlementStatus[]> = {
  required: ["submitted", "verified", "failed", "expired"],
  submitted: ["verified", "failed", "expired"],
  verified: ["served", "failed", "refunded"],
  served: ["refunded"],
  failed: [],
  expired: ["refunded"],
  refunded: [],
};

export class SettlementValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SettlementValidationError";
  }
}

export class SettlementConflictError extends SettlementValidationError {
  constructor(message: string) {
    super(message);
    this.name = "SettlementConflictError";
  }
}

function validHexHash(value: string | undefined) {
  return value === undefined || /^0x[a-fA-F0-9]{64}$/.test(value) || /^[a-fA-F0-9]{64}$/.test(value);
}

export function canonicalAssetId(chainFamily: X402ChainFamily, network: string, asset: string): string {
  const value = asset.trim();
  if (!value) throw new SettlementValidationError("asset is required");
  return `${chainFamily}:${network.trim().toLowerCase()}:${chainFamily === "evm" ? value.toLowerCase() : value.toUpperCase()}`;
}

export function redactPayer(payer: string | undefined): string | undefined {
  if (!payer) return undefined;
  if (payer.startsWith("0x") && payer.length >= 12) return `${payer.slice(0, 6)}...${payer.slice(-4)}`.toLowerCase();
  if (payer.length >= 12) return `${payer.slice(0, 4)}...${payer.slice(-4)}`;
  return "redacted";
}

function validateRequest(input: SettlementRequest) {
  if (!input.idempotencyKey.trim() || !input.requestId.trim()) throw new SettlementValidationError("idempotencyKey and requestId are required");
  if (!input.protectedResource.trim() || !/^[a-fA-F0-9]{64}$/.test(input.requestBodyHash)) throw new SettlementValidationError("protectedResource and requestBodyHash are required");
  if (!/^\d+(?:\.\d+)?$/.test(input.amount) || Number(input.amount) <= 0) throw new SettlementValidationError("amount must be a positive decimal string");
  if (input.chainFamily === "evm" && !input.network.startsWith("eip155:")) throw new SettlementValidationError("EVM settlement network must use eip155 CAIP-2 format");
  if (input.chainFamily === "stellar" && !input.network.startsWith("stellar:")) throw new SettlementValidationError("Stellar settlement network must use stellar CAIP-2 format");
  if (input.chainFamily === "evm" && !/^0x[a-fA-F0-9]{40}$/.test(input.payTo)) throw new SettlementValidationError("EVM payTo must be an address");
  if (input.chainFamily === "stellar" && !/^G[A-Z2-7]{55}$/.test(input.payTo)) throw new SettlementValidationError("Stellar payTo must be an account");
  if (!validHexHash(input.transactionHash)) throw new SettlementValidationError("transactionHash has an invalid format");
  const expiry = Date.parse(input.expiresAt);
  if (!Number.isFinite(expiry)) throw new SettlementValidationError("expiresAt must be an ISO timestamp");
  if (input.payer) {
    const validPayer = input.chainFamily === "evm" ? /^0x[a-fA-F0-9]{40}$/.test(input.payer) : /^G[A-Z2-7]{55}$/.test(input.payer);
    if (!validPayer) throw new SettlementValidationError("payer does not match the settlement chain family");
  }
  canonicalAssetId(input.chainFamily, input.network, input.asset);
}

function fingerprint(input: SettlementRequest) {
  return createHash("sha256").update(JSON.stringify([
    input.requestId,
    input.protectedResource,
    input.requestBodyHash,
    input.chainFamily,
    input.network,
    canonicalAssetId(input.chainFamily, input.network, input.asset),
    input.amount,
    input.payTo.toLowerCase(),
    input.payer?.toLowerCase() ?? "",
    input.transactionHash?.toLowerCase() ?? "",
    input.payloadRef ?? "",
  ])).digest("hex");
}

function canTransition(from: SettlementStatus, to: SettlementStatus) {
  return TRANSITIONS[from].includes(to);
}

/**
 * Durable-ledger-compatible settlement state machine. The default store is
 * in-memory for local/dev use; callers can snapshot records into Postgres
 * using the same idempotency key and fingerprint contract.
 */
export class SettlementLedger {
  private readonly records = new Map<string, SettlementRecord>();
  private readonly locks = new Map<string, Promise<void>>();
  private sequence = 0;

  constructor(private readonly now: () => number = Date.now) {}

  private async serialize<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => { release = resolve; });
    const queued = previous.then(() => current);
    this.locks.set(key, queued);
    await previous;
    try { return await operation(); } finally { release(); if (this.locks.get(key) === queued) this.locks.delete(key); }
  }

  async begin(input: SettlementRequest): Promise<{ record: SettlementRecord; idempotent: boolean }> {
    validateRequest(input);
    return this.serialize(input.idempotencyKey, async () => {
      const existing = this.records.get(input.idempotencyKey);
      const nextFingerprint = fingerprint(input);
      if (existing) {
        if (existing.bindingFingerprint !== nextFingerprint) throw new SettlementConflictError("idempotency key is bound to a different payment payload");
        return { record: structuredClone(existing), idempotent: true };
      }
      const timestamp = new Date(this.now()).toISOString();
      const { payer: _payer, ...safeInput } = input;
      const record: SettlementRecord = {
        ...safeInput,
        id: `set_${++this.sequence}_${randomUUID().slice(0, 8)}`,
        canonicalAsset: canonicalAssetId(input.chainFamily, input.network, input.asset),
        payerRedacted: redactPayer(input.payer),
        bindingFingerprint: nextFingerprint,
        status: "required",
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      this.records.set(input.idempotencyKey, record);
      return { record: structuredClone(record), idempotent: false };
    });
  }

  async transition(idempotencyKey: string, status: SettlementStatus, failureReason?: string): Promise<SettlementRecord> {
    return this.serialize(idempotencyKey, async () => {
      const record = this.records.get(idempotencyKey);
      if (!record) throw new SettlementValidationError("settlement record not found");
      if (record.status === status) return structuredClone(record);
      if (!canTransition(record.status, status)) throw new SettlementConflictError(`invalid settlement transition ${record.status} -> ${status}`);
      record.status = status;
      record.failureReason = failureReason;
      record.updatedAt = new Date(this.now()).toISOString();
      return structuredClone(record);
    });
  }

  async reconcile(idempotencyKey: string, observation: SettlementObservation): Promise<SettlementRecord> {
    return this.serialize(idempotencyKey, async () => {
      const record = this.records.get(idempotencyKey);
      if (!record) throw new SettlementValidationError("settlement record not found");
      const canonical = canonicalAssetId(observation.chainFamily, observation.network, observation.asset);
      const matches = record.chainFamily === observation.chainFamily && record.network === observation.network && record.canonicalAsset === canonical && record.amount === observation.amount && (!record.transactionHash || record.transactionHash === observation.transactionHash);
      if (!matches) {
        record.status = "failed";
        record.failureReason = "settlement observation does not match the required payment";
        record.updatedAt = new Date(this.now()).toISOString();
        throw new SettlementConflictError(record.failureReason);
      }
      record.reconciliation = { checkedAt: new Date(this.now()).toISOString(), transactionHash: observation.transactionHash, amount: observation.amount, canonicalAsset: canonical, network: observation.network };
      if (record.status === "required" || record.status === "submitted") record.status = "verified";
      record.updatedAt = new Date(this.now()).toISOString();
      return structuredClone(record);
    });
  }

  async expireDue(at = this.now()): Promise<SettlementRecord[]> {
    const expired: SettlementRecord[] = [];
    for (const record of this.records.values()) {
      if ((record.status === "required" || record.status === "submitted") && Date.parse(record.expiresAt) <= at) {
        await this.transition(record.idempotencyKey, "expired");
        expired.push(structuredClone(this.records.get(record.idempotencyKey)!));
      }
    }
    return expired;
  }

  get(idempotencyKey: string) {
    const record = this.records.get(idempotencyKey);
    return record ? structuredClone(record) : null;
  }

  list() {
    return [...this.records.values()].map((record) => structuredClone(record));
  }
}

export const settlementLedger = new SettlementLedger();
