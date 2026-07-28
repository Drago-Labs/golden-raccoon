// Note: server-only is intentionally NOT imported here at module scope.
// The Supabase adapter (adapters/supabase.ts) imports server-only
// to protect server credentials. We use dynamic import for the adapter
// so server-only is only triggered when Supabase is actually selected
// (server-side only). Fixture tests and client-side imports of types
// are unaffected.

import type {
  AgentResult,
  AgentRunRecord,
  RecommendationRecord,
  StorageCounts,
  StorageHealth,
  TransactionRecord,
  UserApprovalRecord,
  UserRule,
  X402PaymentReceipt,
} from "@/server/types";
import { getDefaultRules } from "@/server/rules/defaultRules";
import { validateAgentResult } from "@/server/agents/schema";

import type { IStorageAdapter, HealthProbeResult } from "./adapters/types";
import { MemoryStorageAdapter } from "./adapters/memory";
export { storageSchemaContract } from "./contract";
export type { AgentRunRecord };
export type { HealthProbeResult };

// ─── Lazy adapter initialization ──────────────────────────────────────────────

function isSupabaseConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

let _adapter: IStorageAdapter | null = null;

async function getAdapter(): Promise<IStorageAdapter> {
  if (_adapter) return _adapter;

  if (isSupabaseConfigured()) {
    try {
      // Dynamic import so server-only guard in supabase.ts is only triggered
      // when actually selecting Supabase (server-side only).
      const { SupabaseStorageAdapter } = await import("./adapters/supabase");
      _adapter = new SupabaseStorageAdapter();
      return _adapter;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Supabase init failed, falling back to memory:", msg);
    }
  }

  _adapter = new MemoryStorageAdapter();
  return _adapter;
}

/** Provider information (available synchronously after first init). */
export function getStorageProvider() {
  if (_adapter) {
    return { provider: _adapter.provider, persistent: _adapter.persistent };
  }
  return { provider: "memory" as const, persistent: false };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createId(): string {
  return `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function createRecordId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function hashSourceSnapshot(value: unknown): string {
  const serialized = stableStringify(value);
  let hash = 5381;
  for (let index = 0; index < serialized.length; index += 1) {
    hash = (hash * 33) ^ serialized.charCodeAt(index);
  }
  return `snap_${(hash >>> 0).toString(16)}`;
}

// ─── Health ──────────────────────────────────────────────────────────────────

export async function getStorageHealth(): Promise<StorageHealth> {
  return (await getAdapter()).getStorageHealth();
}

export async function getStorageCounts(): Promise<StorageCounts> {
  return (await getAdapter()).getStorageCounts();
}

export async function performStorageHealthProbe(): Promise<HealthProbeResult> {
  return (await getAdapter()).performHealthProbe();
}

// ─── Agent runs ──────────────────────────────────────────────────────────────

export async function listAgentRunRecords(walletAddress?: string): Promise<AgentRunRecord[]> {
  return (await getAdapter()).listAgentRunRecords(walletAddress);
}

export async function getAgentRunRecord(id: string): Promise<AgentRunRecord | null> {
  return (await getAdapter()).getAgentRunRecord(id);
}

export async function createAgentRunRecord(input: {
  walletAddress: string;
  mode?: AgentRunRecord["mode"];
  inputSnapshot?: Record<string, unknown>;
  targetToken?: AgentRunRecord["targetToken"];
  results: AgentResult[];
  userAction?: AgentRunRecord["userAction"];
}): Promise<AgentRunRecord> {
  // Validate results before persisting
  for (const result of input.results) {
    const parsed = validateAgentResult(result);
    if (!parsed.success) {
      throw new Error(`Invalid AgentResult cannot be stored for ${result.agent}: ${parsed.error.message}`);
    }
  }

  const decision = [...input.results].reverse().find((result) => result.agent === "decision");
  const failed = input.results.some((result) => result.status === "error" || result.status === "unavailable");
  const completed = input.results.some((result) => result.agent === "decision");

  const sourceStatuses = input.results.map((result) => ({
    agent: result.agent,
    connected: result.sources.filter((source) => source.status === "connected").length,
    unavailable: result.sources.filter((source) => source.status === "unavailable").length,
    mock: result.sources.filter((source) => source.status === "mock").length,
  }));

  const resultSnapshots = input.results.map((result) => ({
    agent: result.agent,
    rawSignals: result.rawSignals ?? {},
    sources: result.sources,
    sourceSnapshotHash: hashSourceSnapshot({
      agent: result.agent,
      sources: result.sources,
      rawSignals: result.rawSignals ?? {},
    }),
    immutable: true,
    decisionExplanation: result.agent === "decision" ? result.rawSignals?.explanation : undefined,
  }));

  const createdAt = new Date().toISOString();

  const insert = {
    id: createId(),
    walletAddress: input.walletAddress,
    mode: input.mode ?? null,
    targetToken: input.targetToken ?? null,
    status: (completed ? (failed ? "partial" : "completed") : "failed") as AgentRunRecord["status"],
    recommendation: (decision?.recommendedAction ?? "manual_review") as AgentRunRecord["recommendation"],
    decisionScore: decision?.score ?? Math.max(...input.results.map((r) => r.score), 50),
    confidence: decision?.confidence ?? 0.28,
    summary: decision?.summary ?? "Agent run ended before a final decision was produced.",
    results: input.results,
    sourceStatuses,
    inputSnapshot: { ...(input.inputSnapshot ?? {}), resultSnapshots },
    userAction: input.userAction ?? "pending",
    createdAt,
  };

  const adapter = await getAdapter();
  const record = await adapter.createAgentRunRecord(insert);

  // Also create a recommendation record
  await createRecommendationRecord({
    runId: record.id,
    walletAddress: record.walletAddress,
    action: record.recommendation,
    decisionScore: record.decisionScore,
    confidence: record.confidence,
    summary: record.summary,
  });

  return record;
}

// ─── Recommendations ─────────────────────────────────────────────────────────

export async function listRecommendationRecords(walletAddress?: string): Promise<RecommendationRecord[]> {
  return (await getAdapter()).listRecommendationRecords(walletAddress);
}

export async function createRecommendationRecord(input: Omit<RecommendationRecord, "id" | "createdAt">): Promise<RecommendationRecord> {
  const record: RecommendationRecord = {
    id: createRecordId("rec"),
    createdAt: new Date().toISOString(),
    ...input,
  };
  return (await getAdapter()).createRecommendationRecord(record);
}

// ─── Transactions ────────────────────────────────────────────────────────────

export async function listTransactionRecords(walletAddress?: string): Promise<TransactionRecord[]> {
  return (await getAdapter()).listTransactionRecords(walletAddress);
}

export async function getTransactionRecord(hash: string): Promise<TransactionRecord | null> {
  return (await getAdapter()).getTransactionRecord(hash);
}

export async function createTransactionRecord(input: Omit<TransactionRecord, "createdAt"> & { createdAt?: string }): Promise<TransactionRecord> {
  const record: TransactionRecord = {
    ...input,
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
  return (await getAdapter()).createTransactionRecord(record);
}

// ─── Approvals ───────────────────────────────────────────────────────────────

export async function listApprovalRecords(walletAddress?: string): Promise<UserApprovalRecord[]> {
  return (await getAdapter()).listApprovalRecords(walletAddress);
}

export async function createApprovalRecord(input: Omit<UserApprovalRecord, "id" | "createdAt" | "status" | "autoExecuted">): Promise<UserApprovalRecord> {
  const record: UserApprovalRecord = {
    id: createRecordId("approval"),
    ...input,
    status: "confirmed",
    autoExecuted: false,
    createdAt: new Date().toISOString(),
  };
  return (await getAdapter()).createApprovalRecord(record);
}

// ─── User rules ──────────────────────────────────────────────────────────────

export async function getUserRuleRecord(walletAddress = "0xDemoWallet"): Promise<UserRule> {
  const existing = await (await getAdapter()).getUserRuleRecord(walletAddress);
  if (existing) {
    return { ...getDefaultRules(walletAddress), ...existing, autoExecute: false };
  }
  return { ...getDefaultRules(walletAddress), autoExecute: false };
}

export async function upsertUserRuleRecord(input: UserRule): Promise<UserRule> {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const defaults = getDefaultRules(input.walletAddress);
  const record: UserRule = {
    ...defaults,
    ...input,
    autoExecute: false,
    createdAt,
  };
  return (await getAdapter()).upsertUserRuleRecord(record);
}

// ─── x402 receipts ───────────────────────────────────────────────────────────

export async function listX402PaymentReceipts(): Promise<X402PaymentReceipt[]> {
  return (await getAdapter()).listX402PaymentReceipts();
}

export async function getX402PaymentReceiptByHeaderHash(paymentHeaderHash: string): Promise<X402PaymentReceipt | null> {
  return (await getAdapter()).getX402PaymentReceiptByHeaderHash(paymentHeaderHash);
}

export async function createX402PaymentReceipt(input: Omit<X402PaymentReceipt, "id" | "createdAt" | "updatedAt"> & { createdAt?: string; updatedAt?: string }): Promise<X402PaymentReceipt> {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const record: X402PaymentReceipt = {
    id: createRecordId("x402"),
    ...input,
    createdAt,
    updatedAt: input.updatedAt ?? createdAt,
  };
  const adapter = await getAdapter();
  return adapter.createX402PaymentReceipt(record);
}
