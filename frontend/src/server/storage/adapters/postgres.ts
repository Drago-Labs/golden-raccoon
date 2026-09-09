import crypto from "node:crypto";
import type {
  AgentRunRecord,
  AlertDelivery,
  NotificationPreferences,
  RecommendationRecord,
  TransactionRecord,
  TransactionObservation,
  UserApprovalRecord,
  UserRule,
  X402PaymentReceipt,
  StorageHealth,
  StorageCounts,
} from "@/server/types";
import type { RiskSnapshotRecord } from "@/server/snapshots/schema";
import type {
  IStorageAdapter,
  AgentRunInsert,
  HealthProbeResult,
  WatchlistEntry,
  StoredErasureReceipt,
  ErasureAdapterResult,
  ErasureAdapterTableResult,
  ResidueAdapterResult,
  ResidueAdapterLeak,
} from "./types";
import { alertDeliveryToRow, rowToAlertDelivery } from "./types";
import { storageSchemaContract } from "../contract";
import { normalizeStorageError } from "../errors";
import { PGlite } from "@electric-sql/pglite";

function toUuid(str?: string): string {
  if (!str) return crypto.randomUUID();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str)) {
    return str;
  }
  const hash = crypto.createHash("md5").update(str).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

/**
 * Postgres-backed implementation of IStorageAdapter using direct SQL.
 */
export class PostgresStorageAdapter implements IStorageAdapter {
  readonly provider = "postgres" as const;
  readonly persistent = true;

  constructor(private readonly db: PGlite) {}

  /**
   * List agent run records in descending created_at order.
   */
  async listAgentRunRecords(walletAddress?: string): Promise<AgentRunRecord[]> {
    try {
      const sql = walletAddress
        ? "SELECT * FROM agent_runs WHERE lower(wallet_address) = lower($1) ORDER BY created_at DESC;"
        : "SELECT * FROM agent_runs ORDER BY created_at DESC;";
      const params = walletAddress ? [walletAddress] : [];
      const res = await this.db.query<Record<string, unknown>>(sql, params);
      return res.rows.map(rowToAgentRun);
    } catch (err) {
      throw normalizeStorageError("listAgentRunRecords", err, "agent_runs");
    }
  }

  /**
   * Get an agent run record by id.
   */
  async getAgentRunRecord(id: string): Promise<AgentRunRecord | null> {
    try {
      const res = await this.db.query<Record<string, unknown>>(
        "SELECT * FROM agent_runs WHERE id = $1 LIMIT 1;",
        [toUuid(id)],
      );
      if (res.rows.length === 0) return null;
      return rowToAgentRun(res.rows[0]);
    } catch (err) {
      throw normalizeStorageError("getAgentRunRecord", err, "agent_runs");
    }
  }

  /**
   * Create an agent run record.
   */
  async createAgentRunRecord(record: AgentRunInsert): Promise<AgentRunRecord> {
    try {
      const row = agentRunToRow(record);
      await this.db.query(
        "INSERT INTO agent_runs (id, wallet_address, mode, target_symbol, target_name, target_address, target_chain, target_token_data, input_snapshot, status, recommendation, decision_score, confidence, summary, source_statuses, user_action, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17);",
        [
          row.id,
          row.wallet_address,
          row.mode,
          row.target_symbol,
          row.target_name,
          row.target_address,
          row.target_chain,
          JSON.stringify(row.target_token_data),
          JSON.stringify(row.input_snapshot),
          row.status,
          row.recommendation,
          row.decision_score,
          row.confidence,
          row.summary,
          JSON.stringify(row.source_statuses),
          row.user_action,
          row.created_at,
        ],
      );
      return (await this.getAgentRunRecord(record.id))!;
    } catch (err) {
      throw normalizeStorageError("createAgentRunRecord", err, "agent_runs");
    }
  }

  /**
   * List recommendation records in descending created_at order.
   */
  async listRecommendationRecords(walletAddress?: string): Promise<RecommendationRecord[]> {
    try {
      const sql = walletAddress
        ? "SELECT * FROM recommendations WHERE lower(wallet_address) = lower($1) ORDER BY created_at DESC;"
        : "SELECT * FROM recommendations ORDER BY created_at DESC;";
      const params = walletAddress ? [walletAddress] : [];
      const res = await this.db.query<Record<string, unknown>>(sql, params);
      return res.rows.map(rowToRecommendation);
    } catch (err) {
      throw normalizeStorageError("listRecommendationRecords", err, "recommendations");
    }
  }

  /**
   * Create a recommendation record.
   */
  async createRecommendationRecord(record: RecommendationRecord): Promise<RecommendationRecord> {
    try {
      await this.db.query(
        "INSERT INTO recommendations (id, run_id, wallet_address, action, decision_score, confidence, summary, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8);",
        [
          toUuid(record.id),
          record.runId ? toUuid(record.runId) : null,
          record.walletAddress,
          record.action,
          record.decisionScore,
          record.confidence,
          record.summary,
          record.createdAt,
        ],
      );
      return record;
    } catch (err) {
      throw normalizeStorageError("createRecommendationRecord", err, "recommendations");
    }
  }

  /**
   * List transaction records in descending created_at order.
   */
  async listTransactionRecords(walletAddress?: string): Promise<TransactionRecord[]> {
    try {
      const sql = walletAddress
        ? "SELECT * FROM transactions WHERE lower(wallet_address) = lower($1) ORDER BY created_at DESC;"
        : "SELECT * FROM transactions ORDER BY created_at DESC;";
      const params = walletAddress ? [walletAddress] : [];
      const res = await this.db.query<Record<string, unknown>>(sql, params);
      return res.rows.map(rowToTransaction);
    } catch (err) {
      throw normalizeStorageError("listTransactionRecords", err, "transactions");
    }
  }

  /**
   * Get a transaction record by hash.
   */
  async getTransactionRecord(hash: string): Promise<TransactionRecord | null> {
    try {
      const res = await this.db.query<Record<string, unknown>>(
        "SELECT * FROM transactions WHERE lower(tx_hash) = lower($1) LIMIT 1;",
        [hash],
      );
      if (res.rows.length === 0) return null;
      return rowToTransaction(res.rows[0]);
    } catch (err) {
      throw normalizeStorageError("getTransactionRecord", err, "transactions");
    }
  }

  /**
   * Create a transaction record. Throws StorageUniqueViolationError on duplicate hash.
   */
  async createTransactionRecord(record: TransactionRecord): Promise<TransactionRecord> {
    try {
      const row = transactionToRow(record);
      await this.db.query(
        "INSERT INTO transactions (tx_hash, type, decision_action, decision_id, asset, value_usd, status, lifecycle_status, chain_family, wallet_address, network, user_approved, simulation_status, policy_status, poll_attempts, confirmation_count, required_confirmations, finality_reached, replacement_hash, last_observed_block_hash, missing_observation_count, manual_review_reason, observation_count, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24);",
        [
          row.tx_hash,
          row.type,
          row.decision_action,
          row.decision_id,
          row.asset,
          row.value_usd,
          row.status,
          row.lifecycle_status,
          row.chain_family,
          row.wallet_address,
          row.network,
          row.user_approved,
          row.simulation_status,
          row.policy_status,
          row.poll_attempts,
          row.confirmation_count,
          row.required_confirmations,
          row.finality_reached,
          row.replacement_hash,
          row.last_observed_block_hash,
          row.missing_observation_count,
          row.manual_review_reason,
          row.observation_count,
          row.created_at,
        ],
      );
      return record;
    } catch (err) {
      throw normalizeStorageError("createTransactionRecord", err, "transactions");
    }
  }

  /**
   * List observations for a transaction in descending observed_at order.
   */
  async listTransactionObservations(hash: string): Promise<TransactionObservation[]> {
    try {
      const res = await this.db.query<Record<string, unknown>>(
        "SELECT * FROM transaction_observations WHERE lower(transaction_hash) = lower($1) ORDER BY observed_at DESC;",
        [hash],
      );
      return res.rows.map(rowToTransactionObservation);
    } catch (err) {
      throw normalizeStorageError("listTransactionObservations", err, "transaction_observations");
    }
  }

  /**
   * Create an observation for a transaction.
   */
  async createTransactionObservation(observation: TransactionObservation): Promise<TransactionObservation> {
    try {
      const row = transactionObservationToRow(observation);
      await this.db.query(
        "INSERT INTO transaction_observations (id, transaction_hash, evidence_key, chain_family, network, provider, provider_url, status, block_number, block_hash, ledger_sequence, confirmations, required_confirmations, replacement_hash, nonce, detail, observed_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) ON CONFLICT (transaction_hash, evidence_key) DO NOTHING;",
        [
          row.id,
          row.transaction_hash,
          row.evidence_key,
          row.chain_family,
          row.network,
          row.provider,
          row.provider_url,
          row.status,
          row.block_number,
          row.block_hash,
          row.ledger_sequence,
          row.confirmations,
          row.required_confirmations,
          row.replacement_hash,
          row.nonce,
          row.detail,
          row.observed_at,
        ],
      );
      return observation;
    } catch (err) {
      throw normalizeStorageError("createTransactionObservation", err, "transaction_observations");
    }
  }

  /**
   * List user approval records in descending created_at order.
   */
  async listApprovalRecords(walletAddress?: string): Promise<UserApprovalRecord[]> {
    try {
      const sql = walletAddress
        ? "SELECT * FROM approvals WHERE lower(wallet_address) = lower($1) ORDER BY created_at DESC;"
        : "SELECT * FROM approvals ORDER BY created_at DESC;";
      const params = walletAddress ? [walletAddress] : [];
      const res = await this.db.query<Record<string, unknown>>(sql, params);
      return res.rows.map(rowToApproval);
    } catch (err) {
      throw normalizeStorageError("listApprovalRecords", err, "approvals");
    }
  }

  /**
   * Create a user approval record.
   */
  async createApprovalRecord(record: UserApprovalRecord): Promise<UserApprovalRecord> {
    try {
      const chainFamily = record.walletAddress.startsWith("G") ? "stellar" : "evm";
      const network = record.network ?? (chainFamily === "stellar" ? "stellar-mainnet" : "ethereum-mainnet");
      await this.db.query(
        "INSERT INTO approvals (id, wallet_address, decision_id, tx_hash, network, chain_family, action, asset, value_usd, status, auto_executed, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12);",
        [
          toUuid(record.id),
          record.walletAddress,
          record.decisionId ?? null,
          record.txHash,
          network,
          chainFamily,
          record.action ?? null,
          record.asset ?? null,
          record.valueUsd ?? null,
          record.status,
          record.autoExecuted,
          record.createdAt,
        ],
      );
      return record;
    } catch (err) {
      throw normalizeStorageError("createApprovalRecord", err, "approvals");
    }
  }

  /**
   * Get user rule record by wallet address.
   */
  async getUserRuleRecord(walletAddress: string): Promise<UserRule | null> {
    try {
      const res = await this.db.query<Record<string, unknown>>(
        "SELECT * FROM user_rules WHERE lower(wallet_address) = lower($1) LIMIT 1;",
        [walletAddress],
      );
      if (res.rows.length === 0) return null;
      return rowToUserRule(res.rows[0]);
    } catch (err) {
      throw normalizeStorageError("getUserRuleRecord", err, "user_rules");
    }
  }

  /**
   * Upsert a user rule record.
   */
  async upsertUserRuleRecord(rule: UserRule): Promise<UserRule> {
    try {
      const chainFamily = rule.walletAddress.startsWith("G") ? "stellar" : "evm";
      const network = rule.walletAddress.startsWith("G") ? "stellar-mainnet" : "legacy-evm";
      await this.db.query(
        "INSERT INTO user_rules (wallet_address, max_risk_score, max_trade_percent, max_meme_exposure_percent, max_daily_transaction_value_usd, max_slippage_bps, allowed_chains, blocked_tokens, allowed_actions, auto_execute, created_at, chain_family, network) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) ON CONFLICT (chain_family, network, wallet_address) DO UPDATE SET max_risk_score = EXCLUDED.max_risk_score, max_trade_percent = EXCLUDED.max_trade_percent, max_meme_exposure_percent = EXCLUDED.max_meme_exposure_percent, max_daily_transaction_value_usd = EXCLUDED.max_daily_transaction_value_usd, max_slippage_bps = EXCLUDED.max_slippage_bps, allowed_chains = EXCLUDED.allowed_chains, blocked_tokens = EXCLUDED.blocked_tokens, allowed_actions = EXCLUDED.allowed_actions, auto_execute = EXCLUDED.auto_execute;",
        [
          rule.walletAddress,
          rule.maxRiskScore,
          rule.maxTradePercent,
          rule.maxMemeExposurePercent,
          rule.maxDailyTransactionValueUsd ?? null,
          rule.maxSlippageBps ?? null,
          rule.allowedChains ? JSON.stringify(rule.allowedChains) : null,
          rule.blockedTokens ? JSON.stringify(rule.blockedTokens) : null,
          rule.allowedActions ? JSON.stringify(rule.allowedActions) : null,
          false,
          rule.createdAt,
          chainFamily,
          network,
        ],
      );
      return rule;
    } catch (err) {
      throw normalizeStorageError("upsertUserRuleRecord", err, "user_rules");
    }
  }

  /**
   * List x402 payment receipts in descending created_at order.
   */
  async listX402PaymentReceipts(): Promise<X402PaymentReceipt[]> {
    try {
      const res = await this.db.query<Record<string, unknown>>(
        "SELECT * FROM x402_payment_receipts ORDER BY created_at DESC;",
      );
      return res.rows.map(rowToX402Receipt);
    } catch (err) {
      throw normalizeStorageError("listX402PaymentReceipts", err, "x402_payment_receipts");
    }
  }

  /**
   * Get an x402 receipt by payment header hash.
   */
  async getX402PaymentReceiptByHeaderHash(paymentHeaderHash: string): Promise<X402PaymentReceipt | null> {
    try {
      const res = await this.db.query<Record<string, unknown>>(
        "SELECT * FROM x402_payment_receipts WHERE payment_header_hash = $1 LIMIT 1;",
        [paymentHeaderHash],
      );
      if (res.rows.length === 0) return null;
      return rowToX402Receipt(res.rows[0]);
    } catch (err) {
      throw normalizeStorageError("getX402PaymentReceiptByHeaderHash", err, "x402_payment_receipts");
    }
  }

  /**
   * Create an x402 payment receipt. Throws StorageUniqueViolationError on duplicate paymentHeaderHash.
   */
  async createX402PaymentReceipt(record: X402PaymentReceipt): Promise<X402PaymentReceipt> {
    try {
      await this.db.query(
        "INSERT INTO x402_payment_receipts (id, request_id, payment_header_hash, wallet_address, payer, transaction_hash, chain_family, payer_identity, network, asset, amount, price_usd, pay_to, facilitator_url, protected_resource, request_body_hash, payment_expiry, verification_status, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20);",
        [
          toUuid(record.id),
          record.requestId,
          record.paymentHeaderHash,
          record.walletAddress ?? null,
          record.payer ?? null,
          record.transactionHash ?? null,
          record.chainFamily,
          JSON.stringify(record.payerIdentity ?? {}),
          record.network,
          record.asset,
          record.amount,
          record.priceUsd,
          record.payTo,
          record.facilitatorUrl,
          record.protectedResource,
          record.requestBodyHash,
          record.paymentExpiry ?? null,
          record.verificationStatus,
          record.createdAt,
          record.updatedAt,
        ],
      );
      return record;
    } catch (err) {
      throw normalizeStorageError("createX402PaymentReceipt", err, "x402_payment_receipts");
    }
  }

  /**
   * Get a public risk snapshot by id.
   */
  async getRiskSnapshot(id: string): Promise<RiskSnapshotRecord | null> {
    try {
      const res = await this.db.query<Record<string, unknown>>(
        "SELECT * FROM risk_snapshots WHERE id = $1 LIMIT 1;",
        [id],
      );
      if (res.rows.length === 0) return null;
      return rowToRiskSnapshot(res.rows[0]);
    } catch (err) {
      throw normalizeStorageError("getRiskSnapshot", err, "risk_snapshots");
    }
  }

  /**
   * Create a public risk snapshot. Throws StorageUniqueViolationError on duplicate id.
   */
  async createRiskSnapshot(record: RiskSnapshotRecord): Promise<RiskSnapshotRecord> {
    try {
      await this.db.query(
        "INSERT INTO risk_snapshots (id, schema_version, snapshot, canonical_hash, identity_key, revocation_token_hash, created_at, expires_at, revoked_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);",
        [
          record.id,
          record.schemaVersion,
          JSON.stringify(record.snapshot),
          record.canonicalHash,
          record.identityKey,
          record.revocationTokenHash,
          record.createdAt,
          record.expiresAt,
          record.revokedAt ?? null,
        ],
      );
      return record;
    } catch (err) {
      throw normalizeStorageError("createRiskSnapshot", err, "risk_snapshots");
    }
  }

  /**
   * Revoke a public risk snapshot.
   */
  async revokeRiskSnapshot(id: string, revokedAt: string): Promise<RiskSnapshotRecord | null> {
    try {
      const res = await this.db.query<Record<string, unknown>>(
        "UPDATE risk_snapshots SET revoked_at = coalesce(revoked_at, $2) WHERE id = $1 RETURNING *;",
        [id, revokedAt],
      );
      if (res.rows.length === 0) return null;
      return rowToRiskSnapshot(res.rows[0]);
    } catch (err) {
      throw normalizeStorageError("revokeRiskSnapshot", err, "risk_snapshots");
    }
  }

  /**
   * List alert deliveries in descending created_at order.
   */
  async listAlertDeliveries(alertId?: string, walletAddress?: string): Promise<AlertDelivery[]> {
    try {
      let sql = "SELECT * FROM alert_deliveries WHERE 1=1";
      const params: unknown[] = [];
      if (alertId) {
        params.push(alertId);
        sql += " AND alert_id = $" + params.length;
      }
      if (walletAddress) {
        params.push(walletAddress.toLowerCase());
        sql += " AND lower(wallet_address) = $" + params.length;
      }
      sql += " ORDER BY created_at DESC;";
      const res = await this.db.query<Record<string, unknown>>(sql, params);
      return res.rows.map(rowToAlertDelivery);
    } catch (err) {
      throw normalizeStorageError("listAlertDeliveries", err, "alert_deliveries");
    }
  }

  /**
   * Get an alert delivery by idempotency key.
   */
  async getAlertDeliveryByIdempotencyKey(
    walletAddress: string,
    idempotencyKey: string,
  ): Promise<AlertDelivery | null> {
    try {
      const res = await this.db.query<Record<string, unknown>>(
        "SELECT * FROM alert_deliveries WHERE lower(wallet_address) = lower($1) AND idempotency_key = $2 LIMIT 1;",
        [walletAddress, idempotencyKey],
      );
      if (res.rows.length === 0) return null;
      return rowToAlertDelivery(res.rows[0]);
    } catch (err) {
      throw normalizeStorageError("getAlertDeliveryByIdempotencyKey", err, "alert_deliveries");
    }
  }

  /**
   * Create an alert delivery.
   */
  async createAlertDelivery(record: AlertDelivery): Promise<AlertDelivery> {
    try {
      if (record.idempotencyKey) {
        const existing = await this.getAlertDeliveryByIdempotencyKey(record.walletAddress, record.idempotencyKey);
        if (existing) return existing;
      }
      // Ensure parent alert_rules and alerts exist to satisfy foreign key constraints
      await this.db.query(
        "INSERT INTO alert_rules (id, wallet_address, trigger_type, threshold, created_at) VALUES ('rule_default', $1, 'critical_risk', 10, now()) ON CONFLICT (id) DO NOTHING;",
        [record.walletAddress],
      );
      await this.db.query(
        "INSERT INTO alerts (id, wallet_address, rule_id, trigger_type, observation_key, status, severity, message, before_value, after_value, triggered_at) VALUES ($1, $2, 'rule_default', 'critical_risk', 'key', 'triggered', 'medium', 'Alert message', 100, 90, now()) ON CONFLICT (id) DO NOTHING;",
        [record.alertId, record.walletAddress],
      );

      const row = alertDeliveryToRow(record);
      await this.db.query(
        "INSERT INTO alert_deliveries (id, alert_id, wallet_address, channel, status, error_detail, sanitized_payload, attempt_count, created_at, sent_at, idempotency_key, provider_message_id, next_retry_at, last_attempt_at, terminal) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15);",
        [
          row.id,
          row.alert_id,
          row.wallet_address,
          row.channel,
          row.status,
          row.error_detail,
          JSON.stringify(row.sanitized_payload),
          row.attempt_count,
          row.created_at,
          row.sent_at,
          row.idempotency_key,
          row.provider_message_id,
          row.next_retry_at,
          row.last_attempt_at,
          row.terminal,
        ],
      );
      return record;
    } catch (err) {
      throw normalizeStorageError("createAlertDelivery", err, "alert_deliveries");
    }
  }

  /**
   * Update an alert delivery.
   */
  async updateAlertDelivery(
    id: string,
    walletAddress: string,
    patch: Partial<AlertDelivery>,
  ): Promise<AlertDelivery | null> {
    try {
      const res = await this.db.query<Record<string, unknown>>(
        "SELECT * FROM alert_deliveries WHERE id = $1 AND lower(wallet_address) = lower($2) LIMIT 1;",
        [id, walletAddress],
      );
      if (res.rows.length === 0) return null;
      const current = rowToAlertDelivery(res.rows[0]);
      const updated: AlertDelivery = { ...current, ...patch };
      const row = alertDeliveryToRow(updated);
      await this.db.query(
        "UPDATE alert_deliveries SET channel = $3, status = $4, error_detail = $5, sanitized_payload = $6, attempt_count = $7, sent_at = $8, idempotency_key = $9, provider_message_id = $10, next_retry_at = $11, last_attempt_at = $12, terminal = $13 WHERE id = $1 AND lower(wallet_address) = lower($2);",
        [
          id,
          walletAddress,
          row.channel,
          row.status,
          row.error_detail,
          JSON.stringify(row.sanitized_payload),
          row.attempt_count,
          row.sent_at,
          row.idempotency_key,
          row.provider_message_id,
          row.next_retry_at,
          row.last_attempt_at,
          row.terminal,
        ],
      );
      return updated;
    } catch (err) {
      throw normalizeStorageError("updateAlertDelivery", err, "alert_deliveries");
    }
  }

  /**
   * Get notification preferences.
   */
  async getNotificationPreferences(scope: {
    walletAddress: string;
    chainFamily: "evm" | "stellar";
    network: string;
  }): Promise<NotificationPreferences | null> {
    try {
      const nw = scope.walletAddress.toLowerCase();
      const network = scope.network || "legacy-evm";
      const res = await this.db.query<Record<string, unknown>>(
        "SELECT * FROM notification_preferences WHERE lower(wallet_address) = lower($1) AND chain_family = $2 AND network = $3 LIMIT 1;",
        [nw, scope.chainFamily, network],
      );
      if (res.rows.length === 0) return null;
      const row = res.rows[0];
      const prefs = (typeof row.prefs === "string" ? JSON.parse(row.prefs) : row.prefs ?? {}) as Record<string, unknown>;
      return {
        id: String(row.id),
        walletAddress: scope.walletAddress,
        chainFamily: scope.chainFamily,
        network: String(row.network || "legacy-evm"),
        channels: (prefs.channels ?? {}) as NotificationPreferences["channels"],
        quietHours: (prefs.quietHours ?? { enabled: false, start: "22:00", end: "07:00", timeZone: "UTC" }) as NotificationPreferences["quietHours"],
        digestCadence: (prefs.digestCadence ?? "off") as NotificationPreferences["digestCadence"],
        dedupeWindowMinutes: (prefs.dedupeWindowMinutes ?? 30) as number,
        updatedAt: typeof row.updated_at === "string" ? row.updated_at : new Date().toISOString(),
      };
    } catch (err) {
      throw normalizeStorageError("getNotificationPreferences", err, "notification_preferences");
    }
  }

  /**
   * Upsert notification preferences.
   */
  async upsertNotificationPreferences(prefs: NotificationPreferences): Promise<NotificationPreferences> {
    try {
      const nw = prefs.walletAddress.toLowerCase();
      const network = prefs.network || "legacy-evm";
      const id = prefs.id || ("nfpref_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8));
      const payload = {
        channels: prefs.channels,
        quietHours: prefs.quietHours,
        digestCadence: prefs.digestCadence,
        dedupeWindowMinutes: prefs.dedupeWindowMinutes,
      };
      const updatedAt = new Date().toISOString();

      await this.db.query(
        "INSERT INTO notification_preferences (id, wallet_address, chain_family, network, prefs, updated_at) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO UPDATE SET prefs = EXCLUDED.prefs, updated_at = EXCLUDED.updated_at;",
        [
          id,
          nw,
          prefs.chainFamily,
          network,
          JSON.stringify(payload),
          updatedAt,
        ],
      );

      return {
        ...prefs,
        id,
        walletAddress: prefs.walletAddress,
        network,
        updatedAt,
      };
    } catch (err) {
      throw normalizeStorageError("upsertNotificationPreferences", err, "notification_preferences");
    }
  }

  /**
   * Add watchlist entries in bulk.
   */
  async addWatchlistEntriesBulk(entries: WatchlistEntry[]): Promise<{ added: WatchlistEntry[] }> {
    try {
      const added: WatchlistEntry[] = [];
      for (const entry of entries) {
        const check = await this.db.query(
          "SELECT 1 FROM watchlist_entries WHERE lower(wallet_address) = lower($1) AND identity_key = $2 LIMIT 1;",
          [entry.walletAddress, entry.identityKey],
        );
        if (check.rows.length === 0) {
          const id = (entry as any).id || crypto.randomUUID();
          const chain = (entry as any).chain || "ethereum";
          const contractAddress = (entry as any).contractAddress || (entry as any).tokenAddress || null;
          const tokenName = (entry as any).tokenName || (entry as any).name || null;
          const source = (entry as any).source || "manual";

          await this.db.query(
            "INSERT INTO watchlist_entries (id, wallet_address, identity_key, chain, contract_address, symbol, token_name, source, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);",
            [
              id,
              entry.walletAddress,
              entry.identityKey,
              chain,
              contractAddress,
              entry.symbol ?? null,
              tokenName,
              source,
              entry.createdAt,
            ],
          );
          added.push(entry);
        }
      }
      return { added };
    } catch (err) {
      throw normalizeStorageError("addWatchlistEntriesBulk", err, "watchlist_entries");
    }
  }

  /**
   * Perform structured wallet erasure.
   */
  async eraseWalletData(
    walletAddress: string,
    _chainFamily: "evm" | "stellar",
    _network?: string,
  ): Promise<ErasureAdapterResult> {
    try {
      const tables: ErasureAdapterTableResult[] = [];

      const deleteFrom = async (table: string) => {
        const res = await this.db.query("DELETE FROM " + table + " WHERE lower(wallet_address) = lower($1);", [walletAddress]);
        tables.push({ table, action: "deleted", rowsAffected: res.affectedRows ?? 0, strategy: "delete" });
      };

      await deleteFrom("agent_runs");
      await deleteFrom("recommendations");
      await deleteFrom("approvals");
      await deleteFrom("user_rules");
      await deleteFrom("watchlist_entries");
      await deleteFrom("alert_deliveries");

      const txRes = await this.db.query(
        "UPDATE transactions SET wallet_address = NULL WHERE lower(wallet_address) = lower($1);",
        [walletAddress],
      );
      tables.push({ table: "transactions", action: "anonymized", rowsAffected: txRes.affectedRows ?? 0, strategy: "anonymize" });

      return { tables };
    } catch (err) {
      throw normalizeStorageError("eraseWalletData", err);
    }
  }

  /**
   * Scan for residual wallet identity.
   */
  async residueCheck(
    walletAddress: string,
    _chainFamily: "evm" | "stellar",
    _network?: string,
  ): Promise<ResidueAdapterResult> {
    try {
      const leaks: ResidueAdapterLeak[] = [];
      const tables = ["agent_runs", "recommendations", "approvals", "user_rules", "watchlist_entries", "alert_deliveries", "transactions"];
      for (const table of tables) {
        const res = await this.db.query(
          "SELECT count(*) as count FROM " + table + " WHERE lower(wallet_address) = lower($1);",
          [walletAddress],
        );
        const count = Number(res.rows[0]?.count ?? 0);
        if (count > 0) {
          leaks.push({ store: table, field: "wallet_address", hint: walletAddress.slice(0, 8) + "..." });
        }
      }
      return { leaks };
    } catch (err) {
      throw normalizeStorageError("residueCheck", err);
    }
  }

  /**
   * Store erasure receipt.
   */
  async storeErasureReceipt(receipt: StoredErasureReceipt): Promise<StoredErasureReceipt> {
    try {
      const existing = await this.getErasureReceipt(receipt.receiptId);
      if (existing) return existing;
      await this.db.query(
        "INSERT INTO erasure_receipts (receipt_id, wallet_hash, chain_family, network, erased_at, sha256, receipt_body, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8);",
        [
          receipt.receiptId,
          receipt.walletHash,
          receipt.chainFamily,
          receipt.network ?? null,
          receipt.erasedAt,
          receipt.sha256,
          JSON.stringify(typeof receipt.receiptBody === "string" ? JSON.parse(receipt.receiptBody) : receipt.receiptBody),
          receipt.createdAt,
        ],
      );
      return receipt;
    } catch (err) {
      throw normalizeStorageError("storeErasureReceipt", err, "erasure_receipts");
    }
  }

  /**
   * Get erasure receipt by receipt id.
   */
  async getErasureReceipt(receiptId: string): Promise<StoredErasureReceipt | null> {
    try {
      const res = await this.db.query<Record<string, unknown>>(
        "SELECT * FROM erasure_receipts WHERE receipt_id = $1 LIMIT 1;",
        [receiptId],
      );
      if (res.rows.length === 0) return null;
      const row = res.rows[0];
      return {
        receiptId: String(row.receipt_id),
        walletHash: String(row.wallet_hash),
        chainFamily: row.chain_family as "evm" | "stellar",
        network: row.network ? String(row.network) : undefined,
        erasedAt: String(row.erased_at),
        sha256: String(row.sha256),
        receiptBody: typeof row.receipt_body === "string" ? row.receipt_body : JSON.stringify(row.receipt_body),
        createdAt: String(row.created_at),
      };
    } catch (err) {
      throw normalizeStorageError("getErasureReceipt", err, "erasure_receipts");
    }
  }

  /**
   * Get storage health.
   */
  async getStorageHealth(): Promise<StorageHealth> {
    try {
      const probe = await this.performHealthProbe();
      return {
        provider: "postgres" as any,
        persistent: probe.ok,
        detail: probe.ok
          ? "Postgres is connected and operational. " + probe.detail
          : "Postgres probe warning: " + probe.detail,
        schema: storageSchemaContract,
      };
    } catch (err) {
      return {
        provider: "postgres" as any,
        persistent: false,
        detail: "Postgres health check failed: " + (err instanceof Error ? err.message : String(err)),
        schema: storageSchemaContract,
      };
    }
  }

  /**
   * Get storage counts across primary tables.
   */
  async getStorageCounts(): Promise<StorageCounts> {
    try {
      const q = async (table: string): Promise<number> => {
        const res = await this.db.query<{ count: string | number }>("SELECT count(*) as count FROM " + table + ";");
        return Number(res.rows[0]?.count ?? 0);
      };

      const [agentRuns, recommendations, transactions, approvals, userRules, x402Receipts] = await Promise.all([
        q("agent_runs"),
        q("recommendations"),
        q("transactions"),
        q("approvals"),
        q("user_rules"),
        q("x402_payment_receipts"),
      ]);

      return {
        agentRuns,
        recommendations,
        transactions,
        approvals,
        userRules,
        x402Receipts,
      };
    } catch (err) {
      throw normalizeStorageError("getStorageCounts", err);
    }
  }

  /**
   * Perform health probe.
   */
  async performHealthProbe(): Promise<HealthProbeResult> {
    const probeId = crypto.randomUUID();
    const now = new Date().toISOString();
    try {
      const writeStart = Date.now();
      await this.db.query(
        "INSERT INTO agent_runs (id, wallet_address, mode, input_snapshot, status, recommendation, decision_score, confidence, summary, source_statuses, user_action, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12);",
        [probeId, "0x" + "0".repeat(40), "portfolio_review", "{}", "completed", "no_action", 0, 0, "Health probe", "[]", "pending", now],
      );
      const writeLatency = Date.now() - writeStart;

      const readStart = Date.now();
      const res = await this.db.query("SELECT id FROM agent_runs WHERE id = $1 LIMIT 1;", [probeId]);
      const readLatency = Date.now() - readStart;

      await this.db.query("DELETE FROM agent_runs WHERE id = $1;", [probeId]);

      if (res.rows.length > 0) {
        return {
          ok: true,
          write: { ok: true, latencyMs: writeLatency },
          read: { ok: true, latencyMs: readLatency },
          clean: { ok: true },
          detail: `Postgres probe: wrote and read probe record in ${writeLatency + readLatency}ms.`,
        };
      }
      return {
        ok: false,
        detail: "Postgres probe failed: probe record not found after insert.",
      };
    } catch (err) {
      return {
        ok: false,
        detail: `Postgres probe failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }
}

// Row Mappers

function rowToAgentRun(row: Record<string, unknown>): AgentRunRecord {
  const inputSnapshot = typeof row.input_snapshot === "string"
    ? JSON.parse(row.input_snapshot)
    : (row.input_snapshot as Record<string, unknown> ?? {});
  const targetToken = typeof row.target_token_data === "string"
    ? JSON.parse(row.target_token_data)
    : (row.target_token_data as AgentRunRecord["targetToken"] ?? undefined);
  const sourceStatuses = typeof row.source_statuses === "string"
    ? JSON.parse(row.source_statuses)
    : (row.source_statuses as AgentRunRecord["sourceStatuses"] ?? []);

  return {
    id: String(row.id ?? ""),
    walletAddress: String(row.wallet_address ?? ""),
    mode: (row.mode as AgentRunRecord["mode"]) ?? undefined,
    targetToken,
    status: row.status as AgentRunRecord["status"],
    recommendation: row.recommendation as AgentRunRecord["recommendation"],
    decisionScore: Number(row.decision_score ?? 0),
    confidence: Number(row.confidence ?? 0),
    summary: String(row.summary ?? ""),
    results: (inputSnapshot?.resultSnapshots as AgentRunRecord["results"]) ?? [],
    sourceStatuses,
    inputSnapshot,
    userAction: (row.user_action as AgentRunRecord["userAction"]) ?? "pending",
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

function agentRunToRow(record: AgentRunInsert): Record<string, unknown> {
  return {
    id: toUuid(record.id),
    wallet_address: record.walletAddress,
    mode: record.mode ?? null,
    target_symbol: record.targetToken?.symbol ?? null,
    target_name: record.targetToken?.name ?? null,
    target_address: record.targetToken?.tokenAddress ?? null,
    target_chain: record.targetToken?.chain ?? null,
    target_token_data: record.targetToken ?? null,
    input_snapshot: { ...record.inputSnapshot, resultSnapshots: record.results },
    status: record.status,
    recommendation: record.recommendation,
    decision_score: record.decisionScore,
    confidence: record.confidence,
    summary: record.summary,
    source_statuses: record.sourceStatuses ?? [],
    user_action: record.userAction ?? "pending",
    created_at: record.createdAt,
  };
}

function rowToRecommendation(row: Record<string, unknown>): RecommendationRecord {
  return {
    id: String(row.id ?? ""),
    runId: row.run_id ? String(row.run_id) : undefined,
    walletAddress: String(row.wallet_address ?? ""),
    action: row.action as RecommendationRecord["action"],
    decisionScore: Number(row.decision_score ?? 0),
    confidence: Number(row.confidence ?? 0),
    summary: String(row.summary ?? ""),
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

function rowToTransaction(row: Record<string, unknown>): TransactionRecord {
  const policyStatus = typeof row.policy_status === "string"
    ? JSON.parse(row.policy_status)
    : (row.policy_status as TransactionRecord["policyStatus"] ?? undefined);

  return {
    hash: String(row.tx_hash ?? ""),
    type: row.type as TransactionRecord["type"],
    decisionAction: (row.decision_action as TransactionRecord["decisionAction"]) ?? undefined,
    asset: String(row.asset ?? ""),
    valueUsd: Number(row.value_usd ?? 0),
    status: (row.status ?? "pending") as TransactionRecord["status"],
    lifecycleStatus: (row.lifecycle_status ?? row.status ?? "pending") as TransactionRecord["lifecycleStatus"],
    chainFamily: (row.chain_family ?? "evm") as TransactionRecord["chainFamily"],
    createdAt: String(row.created_at ?? new Date().toISOString()),
    network: String(row.network ?? ""),
    walletAddress: String(row.wallet_address ?? ""),
    userApproved: Boolean(row.user_approved ?? false),
    decisionId: row.decision_id ? String(row.decision_id) : undefined,
    simulationStatus: (row.simulation_status as TransactionRecord["simulationStatus"]) ?? undefined,
    policyStatus,
    pollAttempts: Number(row.poll_attempts ?? 0),
    confirmationCount: Number(row.confirmation_count ?? 0),
    requiredConfirmations: Number(row.required_confirmations ?? 1),
    finalityReached: Boolean(row.finality_reached ?? false),
    replacementHash: row.replacement_hash ? String(row.replacement_hash) : undefined,
    lastObservedBlockHash: row.last_observed_block_hash ? String(row.last_observed_block_hash) : undefined,
    missingObservationCount: Number(row.missing_observation_count ?? 0),
    manualReviewReason: row.manual_review_reason ? String(row.manual_review_reason) : undefined,
    observationCount: Number(row.observation_count ?? 0),
  };
}

function transactionToRow(record: TransactionRecord): Record<string, unknown> {
  return {
    tx_hash: record.hash,
    type: record.type,
    decision_action: record.decisionAction ?? null,
    decision_id: record.decisionId ?? null,
    asset: record.asset,
    value_usd: record.valueUsd,
    status: record.status,
    lifecycle_status: record.lifecycleStatus,
    chain_family: record.chainFamily,
    wallet_address: record.walletAddress ?? "",
    network: record.network,
    user_approved: record.userApproved ?? false,
    simulation_status: record.simulationStatus ?? null,
    policy_status: JSON.stringify(record.policyStatus ?? {}),
    poll_attempts: record.pollAttempts ?? 0,
    confirmation_count: record.confirmationCount ?? 0,
    required_confirmations: record.requiredConfirmations ?? 1,
    finality_reached: record.finalityReached ?? false,
    replacement_hash: record.replacementHash ?? null,
    last_observed_block_hash: record.lastObservedBlockHash ?? null,
    missing_observation_count: record.missingObservationCount ?? 0,
    manual_review_reason: record.manualReviewReason ?? null,
    observation_count: record.observationCount ?? 0,
    created_at: record.createdAt,
  };
}

function rowToTransactionObservation(row: Record<string, unknown>): TransactionObservation {
  return {
    id: String(row.id ?? ""),
    hash: String(row.transaction_hash ?? ""),
    evidenceKey: String(row.evidence_key ?? ""),
    chainFamily: row.chain_family as TransactionObservation["chainFamily"],
    network: String(row.network ?? ""),
    provider: String(row.provider ?? ""),
    providerUrl: row.provider_url ? String(row.provider_url) : undefined,
    status: row.status as TransactionObservation["status"],
    blockNumber: row.block_number == null ? undefined : Number(row.block_number),
    blockHash: row.block_hash ? String(row.block_hash) : undefined,
    ledgerSequence: row.ledger_sequence == null ? undefined : Number(row.ledger_sequence),
    confirmations: Number(row.confirmations ?? 0),
    requiredConfirmations: Number(row.required_confirmations ?? 1),
    replacementHash: row.replacement_hash ? String(row.replacement_hash) : undefined,
    nonce: row.nonce == null ? undefined : Number(row.nonce),
    detail: row.detail ? String(row.detail) : undefined,
    observedAt: String(row.observed_at ?? new Date().toISOString()),
  };
}

function transactionObservationToRow(observation: TransactionObservation): Record<string, unknown> {
  return {
    id: observation.id,
    transaction_hash: observation.hash,
    evidence_key: observation.evidenceKey,
    chain_family: observation.chainFamily,
    network: observation.network,
    provider: observation.provider,
    provider_url: observation.providerUrl ?? null,
    status: observation.status,
    block_number: observation.blockNumber ?? null,
    block_hash: observation.blockHash ?? null,
    ledger_sequence: observation.ledgerSequence ?? null,
    confirmations: observation.confirmations,
    required_confirmations: observation.requiredConfirmations,
    replacement_hash: observation.replacementHash ?? null,
    nonce: observation.nonce ?? null,
    detail: observation.detail ?? null,
    observed_at: observation.observedAt,
  };
}

function rowToApproval(row: Record<string, unknown>): UserApprovalRecord {
  return {
    id: String(row.id ?? ""),
    walletAddress: String(row.wallet_address ?? ""),
    decisionId: row.decision_id ? String(row.decision_id) : undefined,
    txHash: String(row.tx_hash ?? ""),
    network: row.network ? String(row.network) : undefined,
    action: (row.action as UserApprovalRecord["action"]) ?? undefined,
    asset: row.asset ? String(row.asset) : undefined,
    valueUsd: row.value_usd ? Number(row.value_usd) : undefined,
    status: (row.status as UserApprovalRecord["status"]) ?? "confirmed",
    autoExecuted: (row.auto_executed === true) as false,
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

function rowToUserRule(row: Record<string, unknown>): UserRule {
  const allowedChains = typeof row.allowed_chains === "string"
    ? JSON.parse(row.allowed_chains)
    : (row.allowed_chains as string[] ?? undefined);
  const blockedTokens = typeof row.blocked_tokens === "string"
    ? JSON.parse(row.blocked_tokens)
    : (row.blocked_tokens as string[] ?? undefined);
  const allowedActions = typeof row.allowed_actions === "string"
    ? JSON.parse(row.allowed_actions)
    : (row.allowed_actions as UserRule["allowedActions"] ?? undefined);

  return {
    walletAddress: String(row.wallet_address ?? ""),
    maxRiskScore: Number(row.max_risk_score ?? 70),
    maxTradePercent: Number(row.max_trade_percent ?? 25),
    maxMemeExposurePercent: Number(row.max_meme_exposure_percent ?? 30),
    maxDailyTransactionValueUsd: row.max_daily_transaction_value_usd
      ? Number(row.max_daily_transaction_value_usd)
      : undefined,
    maxSlippageBps: row.max_slippage_bps ? Number(row.max_slippage_bps) : undefined,
    allowedChains,
    blockedTokens,
    allowedActions,
    autoExecute: Boolean(row.auto_execute ?? false),
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

function rowToX402Receipt(row: Record<string, unknown>): X402PaymentReceipt {
  const network = String(row.network ?? "");
  const chainFamily = (row.chain_family as X402PaymentReceipt["chainFamily"]) ?? (network.startsWith("stellar:") ? "stellar" : "evm");
  const payerIdentity = typeof row.payer_identity === "string"
    ? JSON.parse(row.payer_identity)
    : (row.payer_identity as X402PaymentReceipt["payerIdentity"] ?? undefined);

  return {
    id: String(row.id ?? ""),
    requestId: String(row.request_id ?? ""),
    paymentHeaderHash: String(row.payment_header_hash ?? ""),
    walletAddress: row.wallet_address ? String(row.wallet_address) : undefined,
    payer: row.payer ? String(row.payer) : undefined,
    transactionHash: row.transaction_hash ? String(row.transaction_hash) : undefined,
    chainFamily,
    payerIdentity,
    network,
    asset: String(row.asset ?? ""),
    amount: String(row.amount ?? ""),
    priceUsd: String(row.price_usd ?? ""),
    payTo: String(row.pay_to ?? ""),
    facilitatorUrl: String(row.facilitator_url ?? ""),
    protectedResource: String(row.protected_resource ?? ""),
    requestBodyHash: String(row.request_body_hash ?? ""),
    paymentExpiry: row.payment_expiry ? String(row.payment_expiry) : undefined,
    verificationStatus: row.verification_status as X402PaymentReceipt["verificationStatus"],
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  };
}

function rowToRiskSnapshot(row: Record<string, unknown>): RiskSnapshotRecord {
  const snapshot = typeof row.snapshot === "string"
    ? JSON.parse(row.snapshot)
    : (row.snapshot as RiskSnapshotRecord["snapshot"]);

  return {
    id: String(row.id ?? ""),
    schemaVersion: String(row.schema_version ?? ""),
    snapshot,
    canonicalHash: String(row.canonical_hash ?? ""),
    identityKey: String(row.identity_key ?? ""),
    revocationTokenHash: String(row.revocation_token_hash ?? ""),
    createdAt: String(row.created_at ?? ""),
    expiresAt: String(row.expires_at ?? ""),
    revokedAt: row.revoked_at ? String(row.revoked_at) : undefined,
  };
}
