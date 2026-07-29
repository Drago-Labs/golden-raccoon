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

const memoryStore = globalThis as typeof globalThis & {
  __goldenRaccoonAgentRuns?: AgentRunRecord[];
  __goldenRaccoonRecommendations?: RecommendationRecord[];
  __goldenRaccoonTransactions?: TransactionRecord[];
  __goldenRaccoonApprovals?: UserApprovalRecord[];
  __goldenRaccoonUserRules?: UserRule[];
  __goldenRaccoonX402PaymentReceipts?: X402PaymentReceipt[];
};

function getAgentRuns(): AgentRunRecord[] {
  memoryStore.__goldenRaccoonAgentRuns ??= [];
  return memoryStore.__goldenRaccoonAgentRuns;
}
function getRecommendations(): RecommendationRecord[] {
  memoryStore.__goldenRaccoonRecommendations ??= [];
  return memoryStore.__goldenRaccoonRecommendations;
}
function getTransactions(): TransactionRecord[] {
  memoryStore.__goldenRaccoonTransactions ??= [];
  return memoryStore.__goldenRaccoonTransactions;
}
function getApprovals(): UserApprovalRecord[] {
  memoryStore.__goldenRaccoonApprovals ??= [];
  return memoryStore.__goldenRaccoonApprovals;
}
function getUserRules(): UserRule[] {
  memoryStore.__goldenRaccoonUserRules ??= [];
  return memoryStore.__goldenRaccoonUserRules;
}
function getX402PaymentReceipts(): X402PaymentReceipt[] {
  memoryStore.__goldenRaccoonX402PaymentReceipts ??= [];
  return memoryStore.__goldenRaccoonX402PaymentReceipts;
}

function normalizedWallet(walletAddress?: string): string | undefined {
  return walletAddress?.toLowerCase();
}

function sortDescCreated<T extends { createdAt: string }>(items: T[]): T[] {
  return items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export class MemoryStorageAdapter implements IStorageAdapter {
  readonly provider = "memory" as const;
  readonly persistent = false;

  // ─── Agent runs ──────────────────────────────────────────────────

  async listAgentRunRecords(walletAddress?: string): Promise<AgentRunRecord[]> {
    const nw = normalizedWallet(walletAddress);
    return sortDescCreated(
      getAgentRuns().filter((r) => !nw || r.walletAddress.toLowerCase() === nw),
    );
  }

  async getAgentRunRecord(id: string): Promise<AgentRunRecord | null> {
    return getAgentRuns().find((r) => r.id === id) ?? null;
  }

  async createAgentRunRecord(record: AgentRunInsert): Promise<AgentRunRecord> {
    const full: AgentRunRecord = {
      ...record,
      mode: record.mode ?? undefined,
      targetToken: record.targetToken ?? undefined,
      sourceStatuses: record.sourceStatuses ?? [],
      userAction: record.userAction ?? "pending",
    };
    getAgentRuns().unshift(full);
    return full;
  }

  // ─── Recommendations ─────────────────────────────────────────────

  async listRecommendationRecords(walletAddress?: string): Promise<RecommendationRecord[]> {
    const nw = normalizedWallet(walletAddress);
    return sortDescCreated(
      getRecommendations().filter((r) => !nw || r.walletAddress.toLowerCase() === nw),
    );
  }

  async createRecommendationRecord(record: RecommendationRecord): Promise<RecommendationRecord> {
    getRecommendations().unshift(record);
    return record;
  }

  // ─── Transactions ────────────────────────────────────────────────

  async listTransactionRecords(walletAddress?: string): Promise<TransactionRecord[]> {
    const nw = normalizedWallet(walletAddress);
    return sortDescCreated(
      getTransactions().filter((r) => !nw || (r.walletAddress ?? "").toLowerCase() === nw),
    );
  }

  async getTransactionRecord(hash: string): Promise<TransactionRecord | null> {
    return getTransactions().find((r) => r.hash.toLowerCase() === hash.toLowerCase()) ?? null;
  }

  async createTransactionRecord(record: TransactionRecord): Promise<TransactionRecord> {
    const existingIdx = getTransactions().findIndex(
      (r) => r.hash.toLowerCase() === record.hash.toLowerCase(),
    );
    if (existingIdx >= 0) {
      getTransactions()[existingIdx] = record;
    } else {
      getTransactions().unshift(record);
    }
    return record;
  }

  // ─── Approvals ───────────────────────────────────────────────────

  async listApprovalRecords(walletAddress?: string): Promise<UserApprovalRecord[]> {
    const nw = normalizedWallet(walletAddress);
    return sortDescCreated(
      getApprovals().filter((r) => !nw || r.walletAddress.toLowerCase() === nw),
    );
  }

  async createApprovalRecord(record: UserApprovalRecord): Promise<UserApprovalRecord> {
    getApprovals().unshift(record);
    return record;
  }

  // ─── User rules ──────────────────────────────────────────────────

  async getUserRuleRecord(walletAddress: string): Promise<UserRule | null> {
    const r = getUserRules().find(
      (rule) => rule.walletAddress.toLowerCase() === walletAddress.toLowerCase(),
    );
    return r ?? null;
  }

  async upsertUserRuleRecord(rule: UserRule): Promise<UserRule> {
    const existingIdx = getUserRules().findIndex(
      (r) => r.walletAddress.toLowerCase() === rule.walletAddress.toLowerCase(),
    );
    if (existingIdx >= 0) {
      getUserRules()[existingIdx] = rule;
    } else {
      getUserRules().unshift(rule);
    }
    return rule;
  }

  // ─── x402 receipts ───────────────────────────────────────────────

  async listX402PaymentReceipts(): Promise<X402PaymentReceipt[]> {
    return sortDescCreated(getX402PaymentReceipts());
  }

  async getX402PaymentReceiptByHeaderHash(paymentHeaderHash: string): Promise<X402PaymentReceipt | null> {
    return getX402PaymentReceipts().find((r) => r.paymentHeaderHash === paymentHeaderHash) ?? null;
  }

  async createX402PaymentReceipt(record: X402PaymentReceipt): Promise<X402PaymentReceipt> {
    getX402PaymentReceipts().unshift(record);
    return record;
  }

  // ─── Health & counts ─────────────────────────────────────────────

  async getStorageHealth(): Promise<StorageHealth> {
    return {
      provider: "memory",
      persistent: false,
      detail: "Using in-memory MVP storage. Records reset when the server process restarts.",
      schema: storageSchemaContract,
    };
  }

  async getStorageCounts(): Promise<StorageCounts> {
    return {
      agentRuns: getAgentRuns().length,
      recommendations: getRecommendations().length,
      transactions: getTransactions().length,
      approvals: getApprovals().length,
      userRules: getUserRules().length,
      x402PaymentReceipts: getX402PaymentReceipts().length,
    };
  }

  async performHealthProbe(): Promise<HealthProbeResult> {
    // Memory adapter: write a probe record, read it back, clean it up
    const probeId = `probe_${Date.now()}`;
    const probe: AgentRunInsert = {
      id: probeId,
      walletAddress: "probe",
      mode: null,
      targetToken: null,
      status: "completed",
      recommendation: "no_action",
      decisionScore: 0,
      confidence: 0,
      summary: "health probe",
      results: [],
      sourceStatuses: [],
      inputSnapshot: {},
      userAction: "pending",
      createdAt: new Date().toISOString(),
    };

    const writeStart = Date.now();
    await this.createAgentRunRecord(probe);
    const writeLatency = Date.now() - writeStart;

    const readStart = Date.now();
    const readBack = await this.getAgentRunRecord(probeId);
    const readLatency = Date.now() - readStart;

    // Clean up
    const idx = getAgentRuns().findIndex((r) => r.id === probeId);
    if (idx >= 0) getAgentRuns().splice(idx, 1);

    if (readBack && readBack.id === probeId) {
      return {
        ok: true,
        write: { ok: true, latencyMs: writeLatency },
        read: { ok: true, latencyMs: readLatency },
        clean: { ok: true },
        detail: `Memory probe: wrote and read probe record in ${writeLatency + readLatency}ms.`,
      };
    }
    return {
      ok: false,
      detail: "Memory probe failed: probe record was not readable after write.",
    };
  }
}
