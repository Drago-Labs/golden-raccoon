import type { X402ChainFamily } from "@/server/types";
import type { SettlementRecord } from "@/server/x402/settlement/types";
import type {
  StoredProof,
  StoredQuote,
  StoredReceipt,
  StoredUsage,
  X402Store,
  X402StoreFilter,
} from "@/server/x402/store/store";

/**
 * In-memory thread-safe implementation of X402Store.
 */
export class MemoryX402Store implements X402Store {
  private readonly settlementsByIdempotency = new Map<string, SettlementRecord>();
  private readonly settlementsById = new Map<string, SettlementRecord>();
  private readonly consumedProofs = new Map<string, StoredProof>();
  private readonly receipts = new Map<string, StoredReceipt>();
  private readonly quotes = new Map<string, StoredQuote>();
  private readonly usageByPayer = new Map<string, StoredUsage>();
  private readonly locks = new Map<string, Promise<void>>();

  private async serialize<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const queued = previous.then(() => current);
    this.locks.set(key, queued);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (this.locks.get(key) === queued) {
        this.locks.delete(key);
      }
    }
  }

  /**
   * Saves a new settlement record into memory.
   */
  async saveSettlement(record: SettlementRecord): Promise<void> {
    await this.serialize(`settlement:${record.idempotencyKey}`, async () => {
      const copy = structuredClone(record);
      this.settlementsByIdempotency.set(record.idempotencyKey, copy);
      this.settlementsById.set(record.id, copy);
    });
  }

  /**
   * Retrieves a settlement record by its idempotency key.
   */
  async getSettlement(idempotencyKey: string): Promise<SettlementRecord | null> {
    const record = this.settlementsByIdempotency.get(idempotencyKey);
    return record ? structuredClone(record) : null;
  }

  /**
   * Retrieves a settlement record by its unique settlement ID.
   */
  async getSettlementById(id: string): Promise<SettlementRecord | null> {
    const record = this.settlementsById.get(id);
    return record ? structuredClone(record) : null;
  }

  /**
   * Updates an existing settlement record in memory.
   */
  async updateSettlement(record: SettlementRecord): Promise<void> {
    await this.serialize(`settlement:${record.idempotencyKey}`, async () => {
      const copy = structuredClone(record);
      this.settlementsByIdempotency.set(record.idempotencyKey, copy);
      this.settlementsById.set(record.id, copy);
    });
  }

  /**
   * Lists settlement records filtered by status, payer, resource, or owed state.
   */
  async listSettlements(filter?: X402StoreFilter): Promise<SettlementRecord[]> {
    const all = [...this.settlementsByIdempotency.values()];
    if (!filter) {
      return all.map((entry) => structuredClone(entry));
    }
    return all
      .filter((record) => {
        if (filter.status && record.status !== filter.status) return false;
        if (filter.owed !== undefined && Boolean(record.owed) !== filter.owed) return false;
        if (filter.resource && record.protectedResource !== filter.resource) return false;
        if (filter.payer) {
          const payerMatches =
            record.payerRaw?.toLowerCase() === filter.payer.toLowerCase() ||
            record.payerRedacted?.toLowerCase() === filter.payer.toLowerCase();
          if (!payerMatches) return false;
        }
        return true;
      })
      .map((entry) => structuredClone(entry));
  }

  /**
   * Checks whether a payment proof hash has been recorded.
   */
  async hasProof(proofHash: string): Promise<boolean> {
    return this.consumedProofs.has(proofHash);
  }

  /**
   * Atomically records a payment proof as consumed. Returns false if already consumed.
   */
  async consumeProof(
    proofHash: string,
    settlementId: string,
    chainFamily: X402ChainFamily,
  ): Promise<boolean> {
    return this.serialize(`proof:${proofHash}`, async () => {
      if (this.consumedProofs.has(proofHash)) {
        return false;
      }
      this.consumedProofs.set(proofHash, {
        proofHash,
        settlementId,
        chainFamily,
        consumedAt: new Date().toISOString(),
      });
      return true;
    });
  }

  /**
   * Saves a verifiable receipt into memory.
   */
  async saveReceipt(receipt: StoredReceipt): Promise<void> {
    await this.serialize(`receipt:${receipt.id}`, async () => {
      this.receipts.set(receipt.id, structuredClone(receipt));
    });
  }

  /**
   * Retrieves a verifiable receipt by ID.
   */
  async getReceipt(id: string): Promise<StoredReceipt | null> {
    const receipt = this.receipts.get(id);
    return receipt ? structuredClone(receipt) : null;
  }

  /**
   * Increments redemption count on a receipt and records timestamp.
   */
  async markReceiptRedeemed(id: string): Promise<StoredReceipt> {
    return this.serialize(`receipt:${id}`, async () => {
      const receipt = this.receipts.get(id);
      if (!receipt) {
        throw new Error(`Receipt ${id} not found`);
      }
      receipt.redeemedCount += 1;
      receipt.lastRedeemedAt = new Date().toISOString();
      return structuredClone(receipt);
    });
  }

  /**
   * Saves a price quote into memory.
   */
  async saveQuote(quote: StoredQuote): Promise<void> {
    this.quotes.set(quote.id, structuredClone(quote));
  }

  /**
   * Retrieves a price quote by ID.
   */
  async getQuote(id: string): Promise<StoredQuote | null> {
    const quote = this.quotes.get(id);
    return quote ? structuredClone(quote) : null;
  }

  /**
   * Records usage activity for a payer across chain families.
   */
  async recordUsage(
    payer: string,
    chainFamily: X402ChainFamily,
    delta: { amount: string; canonicalAsset: string; success: boolean },
  ): Promise<StoredUsage> {
    const key = `${chainFamily}:${payer.toLowerCase()}`;
    return this.serialize(`usage:${key}`, async () => {
      const now = new Date().toISOString();
      const existing = this.usageByPayer.get(key) ?? {
        payer,
        payerRedacted: payer.startsWith("0x") && payer.length >= 12
          ? `${payer.slice(0, 6)}...${payer.slice(-4)}`.toLowerCase()
          : payer.length >= 12
            ? `${payer.slice(0, 4)}...${payer.slice(-4)}`
            : payer,
        chainFamily,
        totalRequests: 0,
        totalSpendByAsset: {},
        settlementsCount: 0,
        successfulScans: 0,
        failedScans: 0,
        lastActiveAt: now,
      };

      existing.totalRequests += 1;
      existing.settlementsCount += 1;
      if (delta.success) {
        existing.successfulScans += 1;
      } else {
        existing.failedScans += 1;
      }
      existing.lastActiveAt = now;

      const currentSpend = Number(existing.totalSpendByAsset[delta.canonicalAsset] ?? "0");
      const addedSpend = Number(delta.amount);
      existing.totalSpendByAsset[delta.canonicalAsset] = (currentSpend + addedSpend).toFixed(2);

      this.usageByPayer.set(key, structuredClone(existing));
      return structuredClone(existing);
    });
  }

  /**
   * Retrieves recorded usage for a specific payer.
   */
  async getUsage(payer: string): Promise<StoredUsage | null> {
    for (const [key, usage] of this.usageByPayer.entries()) {
      if (
        usage.payer.toLowerCase() === payer.toLowerCase() ||
        usage.payerRedacted.toLowerCase() === payer.toLowerCase() ||
        key.endsWith(`:${payer.toLowerCase()}`)
      ) {
        return structuredClone(usage);
      }
    }
    return null;
  }

  /**
   * Lists all recorded payer usage summaries.
   */
  async listUsage(): Promise<StoredUsage[]> {
    return [...this.usageByPayer.values()].map((entry) => structuredClone(entry));
  }

  /**
   * Clears all memory state. Used in test resets.
   */
  async clear(): Promise<void> {
    this.settlementsByIdempotency.clear();
    this.settlementsById.clear();
    this.consumedProofs.clear();
    this.receipts.clear();
    this.quotes.clear();
    this.usageByPayer.clear();
    this.locks.clear();
  }
}

export const memoryX402Store = new MemoryX402Store();
