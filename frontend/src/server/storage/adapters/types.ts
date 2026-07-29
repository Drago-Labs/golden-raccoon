import type {
  AgentResult,
  AgentRunRecord,
  RecommendationRecord,
  StorageCounts,
  StorageHealth,
  StorageProvider,
  TransactionRecord,
  UserApprovalRecord,
  UserRule,
  X402PaymentReceipt,
} from "@/server/types";

export type { StorageHealth, StorageCounts, StorageProvider };

/** Arguments passed to createAgentRunRecord after business logic is applied. */
export interface CreateAgentRunInput {
  walletAddress: string;
  mode?: AgentRunRecord["mode"];
  inputSnapshot?: Record<string, unknown>;
  targetToken?: AgentRunRecord["targetToken"];
  results: AgentResult[];
  userAction?: AgentRunRecord["userAction"];
}

/** Pre-built agent run record ready for insertion. */
export interface AgentRunInsert {
  id: string;
  walletAddress: string;
  mode: AgentRunRecord["mode"] | null;
  targetToken: AgentRunRecord["targetToken"] | null;
  status: AgentRunRecord["status"];
  recommendation: AgentRunRecord["recommendation"];
  decisionScore: number;
  confidence: number;
  summary: string;
  results: AgentResult[];
  sourceStatuses: AgentRunRecord["sourceStatuses"];
  inputSnapshot: Record<string, unknown>;
  userAction: AgentRunRecord["userAction"];
  createdAt: string;
}

/** Probe result for read/write health check. */
export interface HealthProbeResult {
  ok: boolean;
  write?: { ok: boolean; latencyMs: number };
  read?: { ok: boolean; latencyMs: number };
  clean?: { ok: boolean };
  detail: string;
}

/**
 * Unified storage adapter interface.
 * Every method returns a Promise so the same API works for both
 * in-memory (synchronous → wrapped) and Supabase (real async I/O).
 */
export interface IStorageAdapter {
  readonly provider: StorageProvider;
  readonly persistent: boolean;

  // ─── Agent runs ──────────────────────────────────────────────────
  listAgentRunRecords(walletAddress?: string): Promise<AgentRunRecord[]>;
  getAgentRunRecord(id: string): Promise<AgentRunRecord | null>;
  createAgentRunRecord(record: AgentRunInsert): Promise<AgentRunRecord>;

  // ─── Recommendations ─────────────────────────────────────────────
  listRecommendationRecords(walletAddress?: string): Promise<RecommendationRecord[]>;
  createRecommendationRecord(record: RecommendationRecord): Promise<RecommendationRecord>;

  // ─── Transactions ────────────────────────────────────────────────
  listTransactionRecords(walletAddress?: string): Promise<TransactionRecord[]>;
  getTransactionRecord(hash: string): Promise<TransactionRecord | null>;
  createTransactionRecord(record: TransactionRecord): Promise<TransactionRecord>;

  // ─── Approvals ───────────────────────────────────────────────────
  listApprovalRecords(walletAddress?: string): Promise<UserApprovalRecord[]>;
  createApprovalRecord(record: UserApprovalRecord): Promise<UserApprovalRecord>;

  // ─── User rules ──────────────────────────────────────────────────
  getUserRuleRecord(walletAddress: string): Promise<UserRule | null>;
  upsertUserRuleRecord(rule: UserRule): Promise<UserRule>;

  // ─── x402 receipts ───────────────────────────────────────────────
  listX402PaymentReceipts(): Promise<X402PaymentReceipt[]>;
  getX402PaymentReceiptByHeaderHash(paymentHeaderHash: string): Promise<X402PaymentReceipt | null>;
  createX402PaymentReceipt(record: X402PaymentReceipt): Promise<X402PaymentReceipt>;

  // ─── Health & counts ─────────────────────────────────────────────
  getStorageHealth(): Promise<StorageHealth>;
  getStorageCounts(): Promise<StorageCounts>;
  performHealthProbe(): Promise<HealthProbeResult>;
}
