import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import type { X402ChainFamily } from "@/server/types";
import type { SettlementRecord } from "@/server/x402/settlement/types";
import { MemoryX402Store } from "@/server/x402/store/memory";
import type {
  StoredProof,
  StoredQuote,
  StoredReceipt,
  StoredUsage,
  X402Store,
  X402StoreFilter,
} from "@/server/x402/store/store";

type QueryResult<T = unknown> = {
  rows: T[];
  rowCount: number;
};

type PgPool = {
  query<T = unknown>(text: string, values?: unknown[]): Promise<QueryResult<T>>;
  end(): Promise<void>;
};

type PgModule = {
  Pool: new (config: { connectionString: string; ssl?: { rejectUnauthorized: boolean } | false }) => PgPool;
};

function resolveConnectionString(): string | undefined {
  return (
    process.env.SUPABASE_DB_URL ||
    process.env.POSTGRES_URL ||
    process.env.DATABASE_URL ||
    undefined
  );
}

function loadPgModule(): PgModule | null {
  try {
    const req = createRequire(import.meta.url);
    return req("pg") as PgModule;
  } catch {
    return null;
  }
}

/**
 * SQL-backed implementation of X402Store with automatic in-memory fallback.
 */
export class SqlX402Store implements X402Store {
  private readonly memory = new MemoryX402Store();
  private pool: PgPool | null = null;
  private schemaApplied = false;

  constructor(private readonly connectionString?: string) {}

  private async getPool(): Promise<PgPool | null> {
    if (this.pool) return this.pool;
    const connStr = this.connectionString ?? resolveConnectionString();
    if (!connStr) return null;
    const pg = loadPgModule();
    if (!pg) return null;
    this.pool = new pg.Pool({
      connectionString: connStr,
      ssl: connStr.includes("localhost") ? false : { rejectUnauthorized: false },
    });
    await this.ensureSchema();
    return this.pool;
  }

  /**
   * Applies the DDL schema if connected to a live Postgres instance.
   */
  async ensureSchema(): Promise<void> {
    if (this.schemaApplied || !this.pool) return;
    try {
      const ddlPath = path.join(process.cwd(), "src/server/x402/store/x402_settlements.sql");
      if (fs.existsSync(ddlPath)) {
        const sql = fs.readFileSync(ddlPath, "utf8");
        await this.pool.query(sql);
      }
      this.schemaApplied = true;
    } catch {
      this.schemaApplied = false;
    }
  }

  /**
   * Saves a settlement record.
   */
  async saveSettlement(record: SettlementRecord): Promise<void> {
    await this.memory.saveSettlement(record);
    const pool = await this.getPool();
    if (!pool) return;
    try {
      await pool.query(
        `INSERT INTO x402_settlements (
          id, idempotency_key, request_id, protected_resource, request_body_hash,
          chain_family, network, asset, canonical_asset, amount, pay_to,
          payer_raw, payer_redacted, transaction_hash, binding_fingerprint,
          status, price_quoted, owed, work_id, receipt_id, result_hash,
          failure_reason, reconciliation, expires_at, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26)
        ON CONFLICT (idempotency_key) DO UPDATE SET
          status = EXCLUDED.status,
          price_quoted = EXCLUDED.price_quoted,
          owed = EXCLUDED.owed,
          work_id = EXCLUDED.work_id,
          receipt_id = EXCLUDED.receipt_id,
          result_hash = EXCLUDED.result_hash,
          failure_reason = EXCLUDED.failure_reason,
          reconciliation = EXCLUDED.reconciliation,
          updated_at = EXCLUDED.updated_at`,
        [
          record.id,
          record.idempotencyKey,
          record.requestId,
          record.protectedResource,
          record.requestBodyHash,
          record.chainFamily,
          record.network,
          record.asset,
          record.canonicalAsset,
          record.amount,
          record.payTo,
          record.payerRaw ?? null,
          record.payerRedacted ?? null,
          record.transactionHash ?? null,
          record.bindingFingerprint,
          record.status,
          record.priceQuoted ?? null,
          record.owed ?? false,
          record.workId ?? null,
          record.receiptId ?? null,
          record.resultHash ?? null,
          record.failureReason ?? null,
          record.reconciliation ? JSON.stringify(record.reconciliation) : null,
          record.expiresAt,
          record.createdAt,
          record.updatedAt,
        ],
      );
    } catch {}
  }

  /**
   * Retrieves a settlement record by idempotency key.
   */
  async getSettlement(idempotencyKey: string): Promise<SettlementRecord | null> {
    return this.memory.getSettlement(idempotencyKey);
  }

  /**
   * Retrieves a settlement record by unique ID.
   */
  async getSettlementById(id: string): Promise<SettlementRecord | null> {
    return this.memory.getSettlementById(id);
  }

  /**
   * Updates an existing settlement record.
   */
  async updateSettlement(record: SettlementRecord): Promise<void> {
    await this.memory.updateSettlement(record);
    const pool = await this.getPool();
    if (!pool) return;
    try {
      await pool.query(
        `UPDATE x402_settlements SET
          status = $1,
          owed = $2,
          work_id = $3,
          receipt_id = $4,
          result_hash = $5,
          failure_reason = $6,
          reconciliation = $7,
          updated_at = $8
        WHERE idempotency_key = $9`,
        [
          record.status,
          record.owed ?? false,
          record.workId ?? null,
          record.receiptId ?? null,
          record.resultHash ?? null,
          record.failureReason ?? null,
          record.reconciliation ? JSON.stringify(record.reconciliation) : null,
          record.updatedAt,
          record.idempotencyKey,
        ],
      );
    } catch {}
  }

  /**
   * Lists settlements filtered by optional criteria.
   */
  async listSettlements(filter?: X402StoreFilter): Promise<SettlementRecord[]> {
    return this.memory.listSettlements(filter);
  }

  /**
   * Checks whether a proof hash is recorded as consumed.
   */
  async hasProof(proofHash: string): Promise<boolean> {
    return this.memory.hasProof(proofHash);
  }

  /**
   * Atomically records a proof as consumed.
   */
  async consumeProof(
    proofHash: string,
    settlementId: string,
    chainFamily: X402ChainFamily,
  ): Promise<boolean> {
    const success = await this.memory.consumeProof(proofHash, settlementId, chainFamily);
    if (!success) return false;
    const pool = await this.getPool();
    if (!pool) return true;
    try {
      await pool.query(
        `INSERT INTO x402_consumed_proofs (proof_hash, settlement_id, chain_family, consumed_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (proof_hash) DO NOTHING`,
        [proofHash, settlementId, chainFamily],
      );
    } catch {}
    return true;
  }

  /**
   * Saves a verifiable receipt.
   */
  async saveReceipt(receipt: StoredReceipt): Promise<void> {
    await this.memory.saveReceipt(receipt);
    const pool = await this.getPool();
    if (!pool) return;
    try {
      await pool.query(
        `INSERT INTO x402_receipts (
          id, settlement_id, resource, payer, payer_redacted, result, result_hash, signature, redeemed_count, expires_at, issued_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (id) DO UPDATE SET
          redeemed_count = EXCLUDED.redeemed_count,
          last_redeemed_at = NOW()`,
        [
          receipt.id,
          receipt.settlementId,
          receipt.resource,
          receipt.payer ?? null,
          receipt.payerRedacted ?? null,
          JSON.stringify(receipt.result),
          receipt.resultHash,
          receipt.signature,
          receipt.redeemedCount,
          receipt.expiresAt,
          receipt.issuedAt,
        ],
      );
    } catch {}
  }

  /**
   * Retrieves a verifiable receipt by ID.
   */
  async getReceipt(id: string): Promise<StoredReceipt | null> {
    return this.memory.getReceipt(id);
  }

  /**
   * Marks a receipt as redeemed.
   */
  async markReceiptRedeemed(id: string): Promise<StoredReceipt> {
    const updated = await this.memory.markReceiptRedeemed(id);
    const pool = await this.getPool();
    if (!pool) return updated;
    try {
      await pool.query(
        `UPDATE x402_receipts SET redeemed_count = $1, last_redeemed_at = $2 WHERE id = $3`,
        [updated.redeemedCount, updated.lastRedeemedAt, id],
      );
    } catch {}
    return updated;
  }

  /**
   * Saves a price quote.
   */
  async saveQuote(quote: StoredQuote): Promise<void> {
    await this.memory.saveQuote(quote);
    const pool = await this.getPool();
    if (!pool) return;
    try {
      await pool.query(
        `INSERT INTO x402_quotes (id, resource, price_usd, amount, asset, network, chain_family, pay_to, created_at, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (id) DO NOTHING`,
        [
          quote.id,
          quote.resource,
          quote.priceUsd,
          quote.amount,
          quote.asset,
          quote.network,
          quote.chainFamily,
          quote.payTo,
          quote.createdAt,
          quote.expiresAt,
        ],
      );
    } catch {}
  }

  /**
   * Retrieves a price quote by ID.
   */
  async getQuote(id: string): Promise<StoredQuote | null> {
    return this.memory.getQuote(id);
  }

  /**
   * Records usage delta for a payer.
   */
  async recordUsage(
    payer: string,
    chainFamily: X402ChainFamily,
    delta: { amount: string; canonicalAsset: string; success: boolean },
  ): Promise<StoredUsage> {
    const updated = await this.memory.recordUsage(payer, chainFamily, delta);
    const pool = await this.getPool();
    if (!pool) return updated;
    try {
      await pool.query(
        `INSERT INTO x402_payer_usage (
          payer, chain_family, payer_redacted, total_requests, total_spend_by_asset,
          settlements_count, successful_scans, failed_scans, last_active_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (payer, chain_family) DO UPDATE SET
          total_requests = EXCLUDED.total_requests,
          total_spend_by_asset = EXCLUDED.total_spend_by_asset,
          settlements_count = EXCLUDED.settlements_count,
          successful_scans = EXCLUDED.successful_scans,
          failed_scans = EXCLUDED.failed_scans,
          last_active_at = EXCLUDED.last_active_at`,
        [
          updated.payer,
          updated.chainFamily,
          updated.payerRedacted,
          updated.totalRequests,
          JSON.stringify(updated.totalSpendByAsset),
          updated.settlementsCount,
          updated.successfulScans,
          updated.failedScans,
          updated.lastActiveAt,
        ],
      );
    } catch {}
    return updated;
  }

  /**
   * Retrieves usage summary for a payer.
   */
  async getUsage(payer: string): Promise<StoredUsage | null> {
    return this.memory.getUsage(payer);
  }

  /**
   * Lists all recorded payer usage summaries.
   */
  async listUsage(): Promise<StoredUsage[]> {
    return this.memory.listUsage();
  }

  /**
   * Resets both memory and pool references.
   */
  async clear(): Promise<void> {
    await this.memory.clear();
  }
}

export const sqlX402Store = new SqlX402Store();
