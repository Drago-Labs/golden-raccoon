import { createHash, randomUUID } from "node:crypto";
import type { X402ChainFamily } from "@/server/types";
import type { SettlementObservation, SettlementRecord, SettlementRequest, SettlementStatus } from "@/server/x402/settlement/types";
import { MemoryX402Store, memoryX402Store } from "@/server/x402/store/memory";
import type { X402Store } from "@/server/x402/store/store";

const TRANSITIONS: Record<SettlementStatus, SettlementStatus[]> = {
  required: ["submitted", "verified", "failed", "expired"],
  submitted: ["verified", "failed", "expired"],
  verified: ["served", "failed", "owed", "refunded"],
  served: ["refunded"],
  failed: ["owed", "refunded"],
  expired: ["refunded"],
  owed: ["refunded"],
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

function validHexHash(value: string | undefined): boolean {
  return value === undefined || /^0x[a-fA-F0-9]{64}$/.test(value) || /^[a-fA-F0-9]{64}$/.test(value);
}

/**
 * Derives a canonical asset identifier across chain families and networks.
 */
export function canonicalAssetId(chainFamily: X402ChainFamily, network: string, asset: string): string {
  const value = asset.trim();
  if (!value) throw new SettlementValidationError("asset is required");
  return `${chainFamily}:${network.trim().toLowerCase()}:${chainFamily === "evm" ? value.toLowerCase() : value.toUpperCase()}`;
}

/**
 * Returns a redacted representation of a payer address for public logs.
 */
export function redactPayer(payer: string | undefined): string | undefined {
  if (!payer) return undefined;
  if (payer.startsWith("0x") && payer.length >= 12) return `${payer.slice(0, 6)}...${payer.slice(-4)}`.toLowerCase();
  if (payer.length >= 12) return `${payer.slice(0, 4)}...${payer.slice(-4)}`;
  return "redacted";
}

function validateRequest(input: SettlementRequest): void {
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

function fingerprint(input: SettlementRequest): string {
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
    input.priceQuoted ?? "",
  ])).digest("hex");
}

function canTransition(from: SettlementStatus, to: SettlementStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/**
 * State machine managing settlement records, idempotent replay prevention, and failure refund states.
 */
export class SettlementLedger {
  private readonly records = new Map<string, SettlementRecord>();
  private readonly rawPayers = new Map<string, string>();
  private readonly locks = new Map<string, Promise<void>>();
  private sequence = 0;

  constructor(
    private readonly now: () => number = Date.now,
    private readonly store: X402Store = new MemoryX402Store(),
  ) {}

  private async serialize<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => { release = resolve; });
    const queued = previous.then(() => current);
    this.locks.set(key, queued);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (this.locks.get(key) === queued) this.locks.delete(key);
    }
  }

  /**
   * Initializes a settlement request or returns existing record idempotently.
   */
  async begin(input: SettlementRequest): Promise<{ record: SettlementRecord; idempotent: boolean }> {
    validateRequest(input);
    return this.serialize(input.idempotencyKey, async () => {
      const existing = this.records.get(input.idempotencyKey) ?? (await this.store.getSettlement(input.idempotencyKey));
      const nextFingerprint = fingerprint(input);
      if (existing) {
        if (existing.bindingFingerprint !== nextFingerprint) {
          throw new SettlementConflictError("idempotency key is bound to a different payment payload");
        }
        return { record: structuredClone(existing), idempotent: true };
      }
      const timestamp = new Date(this.now()).toISOString();
      const { payer: payerRaw, ...safeInput } = input;
      if (payerRaw) {
        this.rawPayers.set(input.idempotencyKey, payerRaw);
      }
      const record: SettlementRecord = {
        ...safeInput,
        id: `set_${++this.sequence}_${randomUUID().slice(0, 8)}`,
        canonicalAsset: canonicalAssetId(input.chainFamily, input.network, input.asset),
        payerRedacted: redactPayer(payerRaw),
        bindingFingerprint: nextFingerprint,
        status: "required",
        priceQuoted: input.priceQuoted,
        owed: false,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      this.records.set(input.idempotencyKey, record);
      await this.store.saveSettlement(record);
      return { record: structuredClone(record), idempotent: false };
    });
  }

  /**
   * Transitions a settlement record to a new state if authorized by the state machine.
   */
  async transition(idempotencyKey: string, status: SettlementStatus, failureReason?: string): Promise<SettlementRecord> {
    return this.serialize(idempotencyKey, async () => {
      const record = this.records.get(idempotencyKey) ?? (await this.store.getSettlement(idempotencyKey));
      if (!record) throw new SettlementValidationError("settlement record not found");
      if (record.status === status) return structuredClone(record);
      if (!canTransition(record.status, status)) {
        throw new SettlementConflictError(`invalid settlement transition ${record.status} -> ${status}`);
      }
      record.status = status;
      if (failureReason) record.failureReason = failureReason;
      if (status === "owed") record.owed = true;
      if (status === "refunded") record.owed = false;
      record.updatedAt = new Date(this.now()).toISOString();
      this.records.set(idempotencyKey, record);
      await this.store.updateSettlement(record);
      return structuredClone(record);
    });
  }

  /**
   * Reconciles observed chain payment details against the required settlement specifications.
   */
  async reconcile(idempotencyKey: string, observation: SettlementObservation): Promise<SettlementRecord> {
    return this.serialize(idempotencyKey, async () => {
      const record = this.records.get(idempotencyKey) ?? (await this.store.getSettlement(idempotencyKey));
      if (!record) throw new SettlementValidationError("settlement record not found");
      const canonical = canonicalAssetId(observation.chainFamily, observation.network, observation.asset);
      const matches =
        record.chainFamily === observation.chainFamily &&
        record.network === observation.network &&
        record.canonicalAsset === canonical &&
        record.amount === observation.amount &&
        (!record.transactionHash || record.transactionHash === observation.transactionHash);
      if (!matches) {
        record.status = "failed";
        record.failureReason = "settlement observation does not match the required payment";
        record.updatedAt = new Date(this.now()).toISOString();
        this.records.set(idempotencyKey, record);
        await this.store.updateSettlement(record);
        throw new SettlementConflictError(record.failureReason);
      }
      record.reconciliation = {
        checkedAt: new Date(this.now()).toISOString(),
        transactionHash: observation.transactionHash,
        amount: observation.amount,
        canonicalAsset: canonical,
        network: observation.network,
      };
      if (record.status === "required" || record.status === "submitted") {
        record.status = "verified";
      }
      record.updatedAt = new Date(this.now()).toISOString();
      this.records.set(idempotencyKey, record);
      await this.store.updateSettlement(record);
      return structuredClone(record);
    });
  }

  /**
   * Binds delivered work identifiers to a settled record.
   */
  async bindWork(
    idempotencyKey: string,
    work: { workId?: string; receiptId?: string; resultHash?: string },
  ): Promise<SettlementRecord> {
    return this.serialize(idempotencyKey, async () => {
      const record = this.records.get(idempotencyKey) ?? (await this.store.getSettlement(idempotencyKey));
      if (!record) throw new SettlementValidationError("settlement record not found");
      if (work.workId) record.workId = work.workId;
      if (work.receiptId) record.receiptId = work.receiptId;
      if (work.resultHash) record.resultHash = work.resultHash;
      record.status = "served";
      record.updatedAt = new Date(this.now()).toISOString();
      this.records.set(idempotencyKey, record);
      await this.store.updateSettlement(record);
      return structuredClone(record);
    });
  }

  /**
   * Records a settlement as owed due to a downstream failure in delivering authorized work.
   */
  async recordWorkFailure(idempotencyKey: string, reason: string): Promise<SettlementRecord> {
    return this.serialize(idempotencyKey, async () => {
      const record = this.records.get(idempotencyKey) ?? (await this.store.getSettlement(idempotencyKey));
      if (!record) throw new SettlementValidationError("settlement record not found");
      record.status = "owed";
      record.owed = true;
      record.failureReason = reason;
      record.updatedAt = new Date(this.now()).toISOString();
      this.records.set(idempotencyKey, record);
      await this.store.updateSettlement(record);
      return structuredClone(record);
    });
  }

  /**
   * Transitions an owed settlement to refunded status.
   */
  async refund(idempotencyKey: string): Promise<SettlementRecord> {
    return this.transition(idempotencyKey, "refunded");
  }

  /**
   * Retrieves the raw unredacted payer address if recorded during begin.
   */
  getRawPayer(idempotencyKey: string): string | undefined {
    return this.rawPayers.get(idempotencyKey);
  }

  /**
   * Lists all settlements currently marked as owed.
   */
  listOwed(): SettlementRecord[] {
    return [...this.records.values()]
      .filter((r) => r.status === "owed" || Boolean(r.owed))
      .map((r) => structuredClone(r));
  }

  /**
   * Expires settlement records whose payment window has elapsed.
   */
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

  /**
   * Retrieves a single settlement record by idempotency key.
   */
  get(idempotencyKey: string): SettlementRecord | null {
    const record = this.records.get(idempotencyKey);
    return record ? structuredClone(record) : null;
  }

  /**
   * Lists all recorded settlements.
   */
  list(): SettlementRecord[] {
    return [...this.records.values()].map((record) => structuredClone(record));
  }
}

export const settlementLedger = new SettlementLedger(Date.now, memoryX402Store);
