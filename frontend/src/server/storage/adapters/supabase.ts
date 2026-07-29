import "server-only";

import { createClient } from "@supabase/supabase-js";
import type {
  AgentRunRecord,
  RecommendationRecord,
  TransactionRecord,
  UserApprovalRecord,
  UserRule,
  X402PaymentReceipt,
  StorageHealth,
  StorageCounts,
} from "@/server/types";
import { storageSchemaContract } from "@/server/storage/contract";
import type { IStorageAdapter, AgentRunInsert, HealthProbeResult } from "./types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Stellar public key prefixes (G = account, C = contract, P = pre-auth tx hash) */
const STELLAR_KEY_PREFIXES = new Set(["G", "C", "P"]);

/**
 * Stellar identifiers (G-accounts, C-contracts, asset keys, tx hashes)
 * are case-sensitive and must never be lowercased.
 * EVM addresses are lowercased for canonical identity.
 *
 * Detects Stellar identifiers by checking for Stellar key prefixes
 * (G, C, P at the start of a 56-char string) or by explicit flag.
 */
function isStellarIdentifier(value: string): boolean {
  // 56-char Stellar keys (G-account, C-contract, P-pre-auth)
  if (value.length === 56 && STELLAR_KEY_PREFIXES.has(value[0])) return true;
  // Multi-part asset keys like "USDC:GA5ZSEJ5FY3QU7ZPN4TN6T6Y2ZDB5V6K6V7OZ5V4U="
  if (value.includes(":") && value.length > 40) return true;
  return false;
}

function preserveChainIdentity(value: string, isStellar: boolean): string {
  return isStellar ? value : value.toLowerCase();
}

/** Singleton Supabase client using server-only service-role credentials. */
function getSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new StorageInitError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: "public" },
  });
}

export class StorageInitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageInitError";
  }
}

// ─── Adapter ──────────────────────────────────────────────────────────────────

export class SupabaseStorageAdapter implements IStorageAdapter {
  readonly provider = "supabase_postgres" as const;
  readonly persistent = true;

  private client = getSupabaseClient();

  // ─── Agent runs ──────────────────────────────────────────────────

  async listAgentRunRecords(walletAddress?: string): Promise<AgentRunRecord[]> {
    let query = this.client
      .from("agent_runs")
      .select("*")
      .order("created_at", { ascending: false });

    if (walletAddress) {
      const s = isStellarIdentifier(walletAddress);
      query = query.eq("wallet_address", preserveChainIdentity(walletAddress, s));
    }

    const { data, error } = await query;
    if (error) throw new StorageError("listAgentRunRecords", error);
    return (data ?? []).map(rowToAgentRun);
  }

  async getAgentRunRecord(id: string): Promise<AgentRunRecord | null> {
    const { data, error } = await this.client
      .from("agent_runs")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) throw new StorageError("getAgentRunRecord", error);
    return data ? rowToAgentRun(data) : null;
  }

  async createAgentRunRecord(record: AgentRunInsert): Promise<AgentRunRecord> {
    const row = agentRunToRow(record);
    const { data, error } = await this.client
      .from("agent_runs")
      .insert(row)
      .select()
      .single();

    if (error) throw new StorageError("createAgentRunRecord", error);
    return rowToAgentRun(data);

    // TODO: In a full implementation, also insert agent_results rows
    // and source_snapshots in a transaction. For V1 MVP, the JSONB
    // fields on agent_runs carry the full result data.
  }

  // ─── Recommendations ─────────────────────────────────────────────

  async listRecommendationRecords(walletAddress?: string): Promise<RecommendationRecord[]> {
    let query = this.client
      .from("recommendations")
      .select("*")
      .order("created_at", { ascending: false });

    if (walletAddress) {
      const isStellar = isStellarIdentifier(walletAddress);
      query = query.eq("wallet_address", preserveChainIdentity(walletAddress, isStellar));
    }

    const { data, error } = await query;
    if (error) throw new StorageError("listRecommendationRecords", error);
    return (data ?? []).map(rowToRecommendation);
  }

  async createRecommendationRecord(record: RecommendationRecord): Promise<RecommendationRecord> {
    const row = recommendationToRow(record);
    const { data, error } = await this.client
      .from("recommendations")
      .insert(row)
      .select()
      .single();

    if (error) throw new StorageError("createRecommendationRecord", error);
    return rowToRecommendation(data);
  }

  // ─── Transactions ────────────────────────────────────────────────

  async listTransactionRecords(walletAddress?: string): Promise<TransactionRecord[]> {
    let query = this.client
      .from("transactions")
      .select("*")
      .order("created_at", { ascending: false });

    if (walletAddress) {
      const isStellar = isStellarIdentifier(walletAddress);
      query = query.eq("wallet_address", preserveChainIdentity(walletAddress, isStellar));
    }

    const { data, error } = await query;
    if (error) throw new StorageError("listTransactionRecords", error);
    return (data ?? []).map(rowToTransaction);
  }

  async getTransactionRecord(hash: string): Promise<TransactionRecord | null> {
    // Use the hash as-is for exact match. The caller knows the chain context
    // and should pass the hash in the appropriate case. For EVM, hashes are
    // typically lowercased; for Stellar, they are case-sensitive.
    // We attempt exact match first, then fall back to case-insensitive if not found.
    const { data: exactData, error: exactError } = await this.client
      .from("transactions")
      .select("*")
      .eq("tx_hash", hash)
      .maybeSingle();

    if (exactError) throw new StorageError("getTransactionRecord", exactError);
    if (exactData) return rowToTransaction(exactData);

    // Fallback: case-insensitive lookup for EVM hashes that may be stored in a different case
    const { data: ciData, error: ciError } = await this.client
      .from("transactions")
      .select("*")
      .ilike("tx_hash", hash)
      .maybeSingle();

    if (ciError) throw new StorageError("getTransactionRecord", ciError);
    return ciData ? rowToTransaction(ciData) : null;
  }

  async createTransactionRecord(record: TransactionRecord): Promise<TransactionRecord> {
    // Deduplicate by hash (case-insensitive for EVM)
    const existing = await this.getTransactionRecord(record.hash);
    if (existing) {
      // Update existing record
      const { data, error } = await this.client
        .from("transactions")
        .update(transactionToRow(record))
        .eq("tx_hash", existing.hash)
        .select()
        .single();

      if (error) throw new StorageError("createTransactionRecord", error);
      return rowToTransaction(data);
    }

    const { data, error } = await this.client
      .from("transactions")
      .insert(transactionToRow(record))
      .select()
      .single();

    if (error) throw new StorageError("createTransactionRecord", error);
    return rowToTransaction(data);
  }

  // ─── Approvals ───────────────────────────────────────────────────

  async listApprovalRecords(walletAddress?: string): Promise<UserApprovalRecord[]> {
    let query = this.client
      .from("approvals")
      .select("*")
      .order("created_at", { ascending: false });

    if (walletAddress) {
      const isStellar = isStellarIdentifier(walletAddress);
      query = query.eq("wallet_address", preserveChainIdentity(walletAddress, isStellar));
    }

    const { data, error } = await query;
    if (error) throw new StorageError("listApprovalRecords", error);
    return (data ?? []).map(rowToApproval);
  }

  async createApprovalRecord(record: UserApprovalRecord): Promise<UserApprovalRecord> {
    const { data, error } = await this.client
      .from("approvals")
      .insert(approvalToRow(record))
      .select()
      .single();

    if (error) throw new StorageError("createApprovalRecord", error);
    return rowToApproval(data);
  }

  // ─── User rules ──────────────────────────────────────────────────

  async getUserRuleRecord(walletAddress: string): Promise<UserRule | null> {
    const isStellar = isStellarIdentifier(walletAddress);
    const { data, error } = await this.client
      .from("user_rules")
      .select("*")
      .eq("wallet_address", preserveChainIdentity(walletAddress, isStellar))
      .maybeSingle();

    if (error) throw new StorageError("getUserRuleRecord", error);
    return data ? rowToUserRule(data) : null;
  }

  async upsertUserRuleRecord(rule: UserRule): Promise<UserRule> {
    const isStellar = isStellarIdentifier(rule.walletAddress);
    const row = userRuleToRow(rule, isStellar);

    const { data, error } = await this.client
      .from("user_rules")
      .upsert(row, { onConflict: "wallet_address" })
      .select()
      .single();

    if (error) throw new StorageError("upsertUserRuleRecord", error);
    return rowToUserRule(data);
  }

  // ─── x402 receipts ───────────────────────────────────────────────

  async listX402PaymentReceipts(): Promise<X402PaymentReceipt[]> {
    const { data, error } = await this.client
      .from("x402_payment_receipts")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw new StorageError("listX402PaymentReceipts", error);
    return (data ?? []).map(rowToX402Receipt);
  }

  async getX402PaymentReceiptByHeaderHash(paymentHeaderHash: string): Promise<X402PaymentReceipt | null> {
    const { data, error } = await this.client
      .from("x402_payment_receipts")
      .select("*")
      .eq("payment_header_hash", paymentHeaderHash)
      .maybeSingle();

    if (error) throw new StorageError("getX402PaymentReceiptByHeaderHash", error);
    return data ? rowToX402Receipt(data) : null;
  }

  async createX402PaymentReceipt(record: X402PaymentReceipt): Promise<X402PaymentReceipt> {
    // Check for duplicate
    const existing = await this.getX402PaymentReceiptByHeaderHash(record.paymentHeaderHash);
    if (existing) {
      return {
        ...existing,
        verificationStatus: "duplicate",
        updatedAt: new Date().toISOString(),
      };
    }

    const { data, error } = await this.client
      .from("x402_payment_receipts")
      .insert(x402ReceiptToRow(record))
      .select()
      .single();

    if (error) throw new StorageError("createX402PaymentReceipt", error);
    return rowToX402Receipt(data);
  }

  // ─── Health & counts ─────────────────────────────────────────────

  async getStorageHealth(): Promise<StorageHealth> {
    // Run connectivity check + full read/write probe
    try {
      const { error } = await this.client.from("agent_runs").select("id", { count: "exact", head: true });
      if (error) {
        return {
          provider: "supabase_postgres",
          persistent: false,
          detail: "Supabase is configured but unreachable: " + error.message,
          schema: storageSchemaContract,
        };
      }

      // Run the full probe to verify persistent read/write
      const probe = await this.performHealthProbe();
      return {
        provider: "supabase_postgres",
        persistent: probe.ok,
        detail: probe.ok
          ? "Supabase Postgres is connected and operational. " + probe.detail
          : "Supabase probe warning: " + probe.detail,
        schema: storageSchemaContract,
      };
    } catch (err) {
      return {
        provider: "supabase_postgres",
        persistent: false,
        detail: "Supabase health check failed: " + (err instanceof Error ? err.message : String(err)),
        schema: storageSchemaContract,
      };
    }
  }

  async getStorageCounts(): Promise<StorageCounts> {
    const [agentRuns, recommendations, transactions, approvals, userRules, x402Receipts] =
      await Promise.all([
        this.client.from("agent_runs").select("*", { count: "exact", head: true }),
        this.client.from("recommendations").select("*", { count: "exact", head: true }),
        this.client.from("transactions").select("*", { count: "exact", head: true }),
        this.client.from("approvals").select("*", { count: "exact", head: true }),
        this.client.from("user_rules").select("*", { count: "exact", head: true }),
        this.client.from("x402_payment_receipts").select("*", { count: "exact", head: true }),
      ]);

    return {
      agentRuns: agentRuns.count ?? 0,
      recommendations: recommendations.count ?? 0,
      transactions: transactions.count ?? 0,
      approvals: approvals.count ?? 0,
      userRules: userRules.count ?? 0,
      x402PaymentReceipts: x402Receipts.count ?? 0,
    };
  }

  async performHealthProbe(): Promise<HealthProbeResult> {
    const probeId = `probe_${Date.now()}`;
    const now = new Date().toISOString();

    // Write probe
    const writeStart = Date.now();
    const { error: writeError } = await this.client.from("agent_runs").insert({
      id: probeId,
      wallet_address: "probe_health_check",
      mode: null,
      input_snapshot: {},
      status: "completed",
      recommendation: "no_action",
      decision_score: 0,
      confidence: 0,
      summary: "Health probe record — safe to delete",
      source_statuses: [],
      user_action: "pending",
      created_at: now,
    });
    const writeLatency = Date.now() - writeStart;

    if (writeError) {
      return {
        ok: false,
        write: { ok: false, latencyMs: writeLatency },
        detail: "Write probe failed: " + writeError.message,
      };
    }

    // Read probe back
    const readStart = Date.now();
    const { data: readBack, error: readError } = await this.client
      .from("agent_runs")
      .select("*")
      .eq("id", probeId)
      .maybeSingle();
    const readLatency = Date.now() - readStart;

    // Clean up probe record
    const { error: cleanError } = await this.client
      .from("agent_runs")
      .delete()
      .eq("id", probeId);

    if (readError || !readBack) {
      return {
        ok: false,
        write: { ok: !writeError, latencyMs: writeLatency },
        read: { ok: false, latencyMs: readLatency },
        clean: { ok: !cleanError },
        detail: readError
          ? "Read probe failed: " + readError.message
          : "Probe record was not readable after write.",
      };
    }

    return {
      ok: true,
      write: { ok: true, latencyMs: writeLatency },
      read: { ok: true, latencyMs: readLatency },
      clean: { ok: !cleanError },
      detail:
        `Write: ${writeLatency}ms, Read: ${readLatency}ms. ` +
        (cleanError ? "Cleanup warning: " + cleanError.message : "Probe cleaned up successfully."),
    };
  }
}

// ─── Custom error ─────────────────────────────────────────────────────────────

export class StorageError extends Error {
  constructor(
    public readonly operation: string,
    public readonly cause: unknown,
  ) {
    const msg = cause instanceof Error ? cause.message : String(cause);
    super(`Supabase storage error [${operation}]: ${msg}`);
    this.name = "StorageError";
  }
}

// ─── Row ↔ Record mappers ────────────────────────────────────────────────────

type AgentRunRow = Record<string, unknown>;
type RecommendationRow = Record<string, unknown>;
type TransactionRow = Record<string, unknown>;
type ApprovalRow = Record<string, unknown>;
type UserRuleRow = Record<string, unknown>;
type X402Row = Record<string, unknown>;

function rowToAgentRun(row: AgentRunRow): AgentRunRecord {
  return {
    id: String(row.id ?? ""),
    walletAddress: String(row.wallet_address ?? ""),
    mode: (row.mode as AgentRunRecord["mode"]) ?? undefined,
    targetToken: row.target_token
      ? (row.target_token as AgentRunRecord["targetToken"])
      : undefined,
    status: row.status as AgentRunRecord["status"],
    recommendation: row.recommendation as AgentRunRecord["recommendation"],
    decisionScore: Number(row.decision_score ?? 0),
    confidence: Number(row.confidence ?? 0),
    summary: String(row.summary ?? ""),
    results: (row.input_snapshot as { resultSnapshots?: unknown[] })?.resultSnapshots as AgentRunRecord["results"] ?? [],
    sourceStatuses: row.source_statuses as AgentRunRecord["sourceStatuses"] ?? [],
    inputSnapshot: row.input_snapshot as Record<string, unknown> ?? {},
    userAction: (row.user_action as AgentRunRecord["userAction"]) ?? "pending",
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

function agentRunToRow(record: AgentRunInsert): AgentRunRow {
  return {
    id: record.id,
    wallet_address: record.walletAddress,
    mode: record.mode ?? null,
    target_symbol: record.targetToken?.symbol ?? null,
    target_name: record.targetToken?.name ?? null,
    target_address: record.targetToken?.tokenAddress ?? null,
    target_chain: record.targetToken?.chain ?? null,
    // Store the full target token object as JSONB for round-trip fidelity,
    // while individual columns are available for queries and indexes.
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

function rowToRecommendation(row: RecommendationRow): RecommendationRecord {
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

function recommendationToRow(record: RecommendationRecord): RecommendationRow {
  return {
    id: record.id,
    run_id: record.runId ?? null,
    wallet_address: record.walletAddress,
    action: record.action,
    decision_score: record.decisionScore,
    confidence: record.confidence,
    summary: record.summary,
    created_at: record.createdAt,
  };
}

function rowToTransaction(row: TransactionRow): TransactionRecord {
  return {
    hash: String(row.tx_hash ?? ""),
    type: row.type as TransactionRecord["type"],
    decisionAction: row.decision_action as TransactionRecord["decisionAction"] ?? undefined,
    asset: String(row.asset ?? ""),
    valueUsd: Number(row.value_usd ?? 0),
    status: row.status as TransactionRecord["status"],
    createdAt: String(row.created_at ?? new Date().toISOString()),
    network: String(row.network ?? ""),
    walletAddress: String(row.wallet_address ?? ""),
    userApproved: Boolean(row.user_approved ?? false),
    decisionId: row.decision_id ? String(row.decision_id) : undefined,
    simulationStatus: row.simulation_status as TransactionRecord["simulationStatus"] ?? undefined,
    policyStatus: row.policy_status as TransactionRecord["policyStatus"] ?? undefined,
  };
}

function transactionToRow(record: TransactionRecord): TransactionRow {
  return {
    tx_hash: record.hash,
    type: record.type,
    decision_action: record.decisionAction ?? null,
    decision_id: record.decisionId ?? null,
    asset: record.asset,
    value_usd: record.valueUsd,
    status: record.status,
    wallet_address: record.walletAddress ?? "",
    network: record.network,
    user_approved: record.userApproved ?? false,
    simulation_status: record.simulationStatus ?? null,
    policy_status: record.policyStatus ?? null,
    created_at: record.createdAt,
  };
}

function rowToApproval(row: ApprovalRow): UserApprovalRecord {
  return {
    id: String(row.id ?? ""),
    walletAddress: String(row.wallet_address ?? ""),
    decisionId: row.decision_id ? String(row.decision_id) : undefined,
    txHash: String(row.tx_hash ?? ""),
    network: row.network ? String(row.network) : undefined,
    action: row.action as UserApprovalRecord["action"] ?? undefined,
    asset: row.asset ? String(row.asset) : undefined,
    valueUsd: row.value_usd ? Number(row.value_usd) : undefined,
    status: (row.status as UserApprovalRecord["status"]) ?? "confirmed",
    autoExecuted: (row.auto_executed === true) as false,
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

function approvalToRow(record: UserApprovalRecord): ApprovalRow {
  return {
    id: record.id,
    wallet_address: record.walletAddress,
    decision_id: record.decisionId ?? null,
    tx_hash: record.txHash,
    network: record.network ?? null,
    action: record.action ?? null,
    asset: record.asset ?? null,
    value_usd: record.valueUsd ?? null,
    status: record.status,
    auto_executed: record.autoExecuted,
    created_at: record.createdAt,
  };
}

function rowToUserRule(row: UserRuleRow): UserRule {
  return {
    walletAddress: String(row.wallet_address ?? ""),
    maxRiskScore: Number(row.max_risk_score ?? 70),
    maxTradePercent: Number(row.max_trade_percent ?? 25),
    maxMemeExposurePercent: Number(row.max_meme_exposure_percent ?? 30),
    maxDailyTransactionValueUsd: row.max_daily_transaction_value_usd
      ? Number(row.max_daily_transaction_value_usd)
      : undefined,
    maxSlippageBps: row.max_slippage_bps ? Number(row.max_slippage_bps) : undefined,
    allowedChains: row.allowed_chains as string[] ?? undefined,
    blockedTokens: row.blocked_tokens as string[] ?? undefined,
    allowedActions: row.allowed_actions as UserRule["allowedActions"] ?? undefined,
    autoExecute: Boolean(row.auto_execute ?? false),
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

function userRuleToRow(rule: UserRule, isStellar: boolean): UserRuleRow {
  return {
    wallet_address: preserveChainIdentity(rule.walletAddress, isStellar),
    max_risk_score: rule.maxRiskScore,
    max_trade_percent: rule.maxTradePercent,
    max_meme_exposure_percent: rule.maxMemeExposurePercent,
    max_daily_transaction_value_usd: rule.maxDailyTransactionValueUsd ?? null,
    max_slippage_bps: rule.maxSlippageBps ?? null,
    allowed_chains: rule.allowedChains ?? null,
    blocked_tokens: rule.blockedTokens ?? null,
    allowed_actions: rule.allowedActions ?? null,
    auto_execute: false, // always force off
    created_at: rule.createdAt,
  };
}

function rowToX402Receipt(row: X402Row): X402PaymentReceipt {
  return {
    id: String(row.id ?? ""),
    requestId: String(row.request_id ?? ""),
    paymentHeaderHash: String(row.payment_header_hash ?? ""),
    walletAddress: row.wallet_address ? String(row.wallet_address) : undefined,
    payer: row.payer ? String(row.payer) : undefined,
    transactionHash: row.transaction_hash ? String(row.transaction_hash) : undefined,
    network: String(row.network ?? ""),
    asset: String(row.asset ?? ""),
    amount: String(row.amount ?? ""),
    priceUsd: String(row.price_usd ?? ""),
    payTo: String(row.pay_to ?? ""),
    facilitatorUrl: String(row.facilitator_url ?? ""),
    protectedResource: String(row.protected_resource ?? ""),
    requestBodyHash: String(row.request_body_hash ?? ""),
    verificationStatus: row.verification_status as X402PaymentReceipt["verificationStatus"],
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  };
}

function x402ReceiptToRow(record: X402PaymentReceipt): X402Row {
  return {
    id: record.id,
    request_id: record.requestId,
    payment_header_hash: record.paymentHeaderHash,
    wallet_address: record.walletAddress ?? null,
    payer: record.payer ?? null,
    transaction_hash: record.transactionHash ?? null,
    network: record.network,
    asset: record.asset,
    amount: record.amount,
    price_usd: record.priceUsd,
    pay_to: record.payTo,
    facilitator_url: record.facilitatorUrl,
    protected_resource: record.protectedResource,
    request_body_hash: record.requestBodyHash,
    verification_status: record.verificationStatus,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}
