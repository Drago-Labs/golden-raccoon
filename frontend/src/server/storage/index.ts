import type {
  AgentResult,
  AgentRunRecord,
  DiscoveryAlert,
  RecommendationRecord,
  StorageCounts,
  StorageHealth,
  TransactionRecord,
  UserApprovalRecord,
  UserRule,
  WatchlistEntry,
  WatchlistEntryInput,
  WatchlistScanRun,
  X402PaymentReceipt,
  AgentSource,
  AgentMissingData,
  DiscoveryClassification,
  RiskLevel,
} from "@/server/types";
import { getDefaultRules } from "@/server/rules/defaultRules";
import { validateAgentResult } from "@/server/agents/schema";

type CreateAgentRunInput = {
  walletAddress: string;
  mode?: AgentRunRecord["mode"];
  inputSnapshot?: Record<string, unknown>;
  targetToken?: AgentRunRecord["targetToken"];
  results: AgentResult[];
  userAction?: AgentRunRecord["userAction"];
};

export const storageSchemaContract = {
  tables: [
    "wallets",
    "agent_runs",
    "agent_results",
    "recommendations",
    "user_rules",
    "approvals",
    "transactions",
    "x402_payment_receipts",
    "token_identities",
    "source_snapshots",
    "watchlist_entries",
    "watchlist_scan_runs",
    "discovery_alerts",
  ],
  adapterApi: [
    "listAgentRunRecords",
    "getAgentRunRecord",
    "createAgentRunRecord",
    "listRecommendationRecords",
    "createRecommendationRecord",
    "listTransactionRecords",
    "createTransactionRecord",
    "listApprovalRecords",
    "createApprovalRecord",
    "listX402PaymentReceipts",
    "getX402PaymentReceiptByHeaderHash",
    "createX402PaymentReceipt",
    "getUserRuleRecord",
    "upsertUserRuleRecord",
    "listWatchlistEntries",
    "getWatchlistEntry",
    "addWatchlistEntry",
    "removeWatchlistEntry",
    "listWatchlistScanRuns",
    "addWatchlistScanRun",
    "listDiscoveryAlerts",
    "acknowledgeDiscoveryAlert",
    "createDiscoveryAlert",
    "updateWatchlistEntryLatestScan",
  ],
  migration: "frontend/src/server/storage/schema.sql",
};

const memoryStore = globalThis as typeof globalThis & {
  __goldenRaccoonAgentRuns?: AgentRunRecord[];
  __goldenRaccoonRecommendations?: RecommendationRecord[];
  __goldenRaccoonTransactions?: TransactionRecord[];
  __goldenRaccoonApprovals?: UserApprovalRecord[];
  __goldenRaccoonUserRules?: UserRule[];
  __goldenRaccoonX402PaymentReceipts?: X402PaymentReceipt[];
  __goldenRaccoonWatchlistEntries?: WatchlistEntry[];
  __goldenRaccoonWatchlistScanRuns?: WatchlistScanRun[];
  __goldenRaccoonDiscoveryAlerts?: DiscoveryAlert[];
};

function getAgentRuns() {
  memoryStore.__goldenRaccoonAgentRuns ??= [];

  return memoryStore.__goldenRaccoonAgentRuns;
}

function getRecommendations() {
  memoryStore.__goldenRaccoonRecommendations ??= [];

  return memoryStore.__goldenRaccoonRecommendations;
}

function getTransactions() {
  memoryStore.__goldenRaccoonTransactions ??= [];

  return memoryStore.__goldenRaccoonTransactions;
}

function getApprovals() {
  memoryStore.__goldenRaccoonApprovals ??= [];

  return memoryStore.__goldenRaccoonApprovals;
}

function getUserRules() {
  memoryStore.__goldenRaccoonUserRules ??= [];

  return memoryStore.__goldenRaccoonUserRules;
}

function getX402PaymentReceipts() {
  memoryStore.__goldenRaccoonX402PaymentReceipts ??= [];

  return memoryStore.__goldenRaccoonX402PaymentReceipts;
}

function getWatchlistEntries() {
  memoryStore.__goldenRaccoonWatchlistEntries ??= [];

  return memoryStore.__goldenRaccoonWatchlistEntries;
}

function getWatchlistScanRuns() {
  memoryStore.__goldenRaccoonWatchlistScanRuns ??= [];

  return memoryStore.__goldenRaccoonWatchlistScanRuns;
}

function getDiscoveryAlerts() {
  memoryStore.__goldenRaccoonDiscoveryAlerts ??= [];

  return memoryStore.__goldenRaccoonDiscoveryAlerts;
}

function createId() {
  return `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function createRecordId(prefix: string) {
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

export function hashSourceSnapshot(value: unknown) {
  const serialized = stableStringify(value);
  let hash = 5381;

  for (let index = 0; index < serialized.length; index += 1) {
    hash = (hash * 33) ^ serialized.charCodeAt(index);
  }

  return `snap_${(hash >>> 0).toString(16)}`;
}

export function getStorageHealth(): StorageHealth {
  const supabaseConfigured = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (supabaseConfigured) {
    return {
      provider: "supabase_postgres",
      persistent: false,
      detail: "Supabase env vars are configured. The MVP adapter still uses in-memory storage, but the function API and schema contract are fixed for adapter parity.",
      schema: storageSchemaContract,
    };
  }

  return {
    provider: "memory",
    persistent: false,
    detail: "Using in-memory MVP storage. Records reset when the server process restarts.",
    schema: storageSchemaContract,
  };
}

export function listAgentRunRecords(walletAddress?: string) {
  const normalizedWallet = walletAddress?.toLowerCase();

  return getAgentRuns()
    .filter((record) => !normalizedWallet || record.walletAddress.toLowerCase() === normalizedWallet)
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
}

export function getAgentRunRecord(id: string) {
  return getAgentRuns().find((record) => record.id === id);
}

export function createAgentRunRecord(input: CreateAgentRunInput): AgentRunRecord {
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
  const record: AgentRunRecord = {
    id: createId(),
    walletAddress: input.walletAddress,
    mode: input.mode,
    targetToken: input.targetToken,
    status: completed ? (failed ? "partial" : "completed") : "failed",
    recommendation: decision?.recommendedAction ?? "manual_review",
    decisionScore: decision?.score ?? Math.max(...input.results.map((result) => result.score), 50),
    confidence: decision?.confidence ?? 0.28,
    summary: decision?.summary ?? "Agent run ended before a final decision was produced.",
    results: input.results,
    sourceStatuses,
    inputSnapshot: {
      ...(input.inputSnapshot ?? {}),
      resultSnapshots,
    },
    userAction: input.userAction ?? "pending",
    createdAt: new Date().toISOString(),
  };

  getAgentRuns().unshift(record);
  createRecommendationRecord({
    runId: record.id,
    walletAddress: record.walletAddress,
    action: record.recommendation,
    decisionScore: record.decisionScore,
    confidence: record.confidence,
    summary: record.summary,
  });

  return record;
}

export function listRecommendationRecords(walletAddress?: string) {
  const normalizedWallet = walletAddress?.toLowerCase();

  return getRecommendations()
    .filter((record) => !normalizedWallet || record.walletAddress.toLowerCase() === normalizedWallet)
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
}

export function createRecommendationRecord(input: Omit<RecommendationRecord, "id" | "createdAt">) {
  const record: RecommendationRecord = {
    id: createRecordId("rec"),
    createdAt: new Date().toISOString(),
    ...input,
  };

  getRecommendations().unshift(record);

  return record;
}

export function listTransactionRecords(walletAddress?: string) {
  const normalizedWallet = walletAddress?.toLowerCase();

  return getTransactions()
    .filter((record) => !normalizedWallet || record.walletAddress?.toLowerCase() === normalizedWallet)
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
}

export function getTransactionRecord(hash: string) {
  return getTransactions().find((record) => record.hash.toLowerCase() === hash.toLowerCase());
}

export function createTransactionRecord(input: Omit<TransactionRecord, "createdAt"> & { createdAt?: string }) {
  const existingIndex = getTransactions().findIndex((record) => record.hash.toLowerCase() === input.hash.toLowerCase());
  const record: TransactionRecord = {
    ...input,
    createdAt: input.createdAt ?? new Date().toISOString(),
  };

  if (existingIndex >= 0) {
    getTransactions()[existingIndex] = record;
  } else {
    getTransactions().unshift(record);
  }

  return record;
}

export function listApprovalRecords(walletAddress?: string) {
  const normalizedWallet = walletAddress?.toLowerCase();

  return getApprovals()
    .filter((record) => !normalizedWallet || record.walletAddress.toLowerCase() === normalizedWallet)
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
}

export function createApprovalRecord(input: Omit<UserApprovalRecord, "id" | "createdAt" | "status" | "autoExecuted">) {
  const record: UserApprovalRecord = {
    id: createRecordId("approval"),
    ...input,
    status: "confirmed",
    autoExecuted: false,
    createdAt: new Date().toISOString(),
  };

  getApprovals().unshift(record);

  return record;
}

export function getUserRuleRecord(walletAddress = "0xDemoWallet") {
  const existing = getUserRules().find((rule) => rule.walletAddress.toLowerCase() === walletAddress.toLowerCase());

  return {
    ...getDefaultRules(walletAddress),
    ...existing,
    autoExecute: false,
  };
}

export function upsertUserRuleRecord(input: UserRule) {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const defaults = getDefaultRules(input.walletAddress);
  const record: UserRule = {
    ...defaults,
    ...input,
    autoExecute: false,
    createdAt,
  };
  const existingIndex = getUserRules().findIndex((rule) => rule.walletAddress.toLowerCase() === input.walletAddress.toLowerCase());

  if (existingIndex >= 0) {
    getUserRules()[existingIndex] = record;
  } else {
    getUserRules().unshift(record);
  }

  return record;
}

export function listX402PaymentReceipts() {
  return getX402PaymentReceipts().sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
}

export function getX402PaymentReceiptByHeaderHash(paymentHeaderHash: string) {
  return getX402PaymentReceipts().find((record) => record.paymentHeaderHash === paymentHeaderHash);
}

export function createX402PaymentReceipt(input: Omit<X402PaymentReceipt, "id" | "createdAt" | "updatedAt"> & { createdAt?: string; updatedAt?: string }) {
  const existing = getX402PaymentReceiptByHeaderHash(input.paymentHeaderHash);

  if (existing) {
    return {
      ...existing,
      verificationStatus: "duplicate" as const,
      updatedAt: new Date().toISOString(),
    };
  }

  const createdAt = input.createdAt ?? new Date().toISOString();
  const record: X402PaymentReceipt = {
    id: createRecordId("x402"),
    ...input,
    createdAt,
    updatedAt: input.updatedAt ?? createdAt,
  };

  getX402PaymentReceipts().unshift(record);

  return record;
}

export function getStorageCounts(): StorageCounts {
  return {
    agentRuns: getAgentRuns().length,
    recommendations: getRecommendations().length,
    transactions: getTransactions().length,
    approvals: getApprovals().length,
    userRules: getUserRules().length,
    x402PaymentReceipts: getX402PaymentReceipts().length,
  };
}

type CreateWatchlistInput = WatchlistEntryInput & {
  identityKey: string;
};

export function listWatchlistEntries(walletAddress?: string) {
  const normalizedWallet = walletAddress?.toLowerCase();

  return getWatchlistEntries()
    .filter((entry) => !normalizedWallet || entry.walletAddress.toLowerCase() === normalizedWallet)
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
}

export function getWatchlistEntry(id: string) {
  return getWatchlistEntries().find((entry) => entry.id === id);
}

export type AddWatchlistEntryResult = {
  entry: WatchlistEntry;
  alreadyExisted: boolean;
};

export function addWatchlistEntry(input: CreateWatchlistInput): AddWatchlistEntryResult {
  const normalizedWallet = input.walletAddress.trim();
  const existing = getWatchlistEntries().find(
    (entry) =>
      entry.walletAddress.toLowerCase() === normalizedWallet.toLowerCase() &&
      entry.identityKey === input.identityKey,
  );

  if (existing) {
    return { entry: existing, alreadyExisted: true };
  }

  const entry: WatchlistEntry = {
    id: createRecordId("watch"),
    walletAddress: normalizedWallet,
    identityKey: input.identityKey,
    chain: input.chain,
    contractAddress: input.contractAddress,
    pairAddress: input.pairAddress,
    symbol: input.symbol,
    tokenName: input.tokenName,
    assetKey: input.assetKey,
    issuer: input.issuer,
    assetType: input.assetType,
    source: input.source,
    note: input.note,
    createdAt: new Date().toISOString(),
  };

  getWatchlistEntries().unshift(entry);

  return { entry, alreadyExisted: false };
}

export function removeWatchlistEntry(id: string) {
  const store = getWatchlistEntries();
  const remaining = store.filter((entry) => entry.id !== id);
  const removed = store.length - remaining.length;

  memoryStore.__goldenRaccoonWatchlistEntries = remaining;

  const runs = getWatchlistScanRuns().filter((run) => run.entryId !== id);
  memoryStore.__goldenRaccoonWatchlistScanRuns = runs;

  const alerts = getDiscoveryAlerts().filter((alert) => alert.entryId !== id);
  memoryStore.__goldenRaccoonDiscoveryAlerts = alerts;

  return removed > 0;
}

type AddWatchlistScanRunInput = {
  entryId: string;
  walletAddress: string;
  identityKey: string;
  classification: DiscoveryClassification;
  classificationReasons: string[];
  confidence: number;
  score: number;
  sourceLineage: AgentSource[];
  missingData: AgentMissingData[];
  riskReport?: WatchlistScanRun["riskReport"];
  agentRunId?: string;
  status?: WatchlistScanRun["status"];
};

export function addWatchlistScanRun(input: AddWatchlistScanRunInput): WatchlistScanRun {
  const previous = getWatchlistScanRuns()
    .filter((run) => run.entryId === input.entryId)
    .sort((left, right) => new Date(right.scannedAt).getTime() - new Date(left.scannedAt).getTime())[0];

  const run: WatchlistScanRun = {
    id: createRecordId("wscan"),
    entryId: input.entryId,
    walletAddress: input.walletAddress,
    identityKey: input.identityKey,
    agentRunId: input.agentRunId,
    classification: input.classification,
    classificationReasons: input.classificationReasons,
    confidence: input.confidence,
    score: input.score,
    sourceLineage: input.sourceLineage,
    missingData: input.missingData,
    riskReport: input.riskReport,
    status: input.status ?? "completed",
    previousRunId: previous?.id,
    scannedAt: new Date().toISOString(),
  };

  getWatchlistScanRuns().unshift(run);
  updateWatchlistEntryLatestScan(input.entryId, {
    scanRunId: run.id,
    classification: run.classification,
    score: run.score,
    scannedAt: run.scannedAt,
    status: run.status,
  });

  return run;
}

export function updateWatchlistEntryLatestScan(
  id: string,
  update: {
    scanRunId: string;
    classification: DiscoveryClassification;
    score: number;
    scannedAt: string;
    status: WatchlistScanRun["status"];
  },
) {
  const entry = getWatchlistEntries().find((candidate) => candidate.id === id);

  if (!entry) {
    return undefined;
  }

  entry.lastScannedAt = update.scannedAt;
  entry.latestScanRunId = update.scanRunId;
  entry.latestClassification = update.classification;
  entry.latestScore = update.score;

  if (update.status === "failed") {
    entry.latestClassification = entry.latestClassification ?? "watch";
  }

  return entry;
}

export function listWatchlistScanRuns(entryId?: string) {
  return getWatchlistScanRuns()
    .filter((run) => !entryId || run.entryId === entryId)
    .sort((left, right) => new Date(right.scannedAt).getTime() - new Date(left.scannedAt).getTime());
}

type CreateDiscoveryAlertInput = {
  walletAddress: string;
  entryId?: string;
  runId?: string;
  kind: DiscoveryAlert["kind"];
  title: string;
  detail: string;
  severity: RiskLevel;
  sourceLabel?: string;
};

export function createDiscoveryAlert(input: CreateDiscoveryAlertInput): DiscoveryAlert {
  const alert: DiscoveryAlert = {
    id: createRecordId("alert"),
    walletAddress: input.walletAddress,
    entryId: input.entryId,
    runId: input.runId,
    kind: input.kind,
    title: input.title,
    detail: input.detail,
    severity: input.severity,
    sourceLabel: input.sourceLabel,
    acknowledged: false,
    createdAt: new Date().toISOString(),
  };

  getDiscoveryAlerts().unshift(alert);

  return alert;
}

export function listDiscoveryAlerts(walletAddress?: string) {
  const normalizedWallet = walletAddress?.toLowerCase();

  return getDiscoveryAlerts()
    .filter((alert) => !normalizedWallet || alert.walletAddress.toLowerCase() === normalizedWallet)
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
}

export function acknowledgeDiscoveryAlert(id: string) {
  const alert = getDiscoveryAlerts().find((candidate) => candidate.id === id);

  if (!alert) {
    return undefined;
  }

  alert.acknowledged = true;

  return alert;
}
