import type {
  AgentResult,
  AgentRunRecord,
  RecommendationRecord,
  StorageCounts,
  StorageHealth,
  TransactionRecord,
  UserApprovalRecord,
  UserRule,
  WatchlistEntry,
  WatchlistEntryInput,
  WatchlistScanRecord,
  X402PaymentReceipt,
} from "@/server/types";
import { canonicalizeAddress } from "@/lib/chainIdentity";
import { getDefaultRules } from "@/server/rules/defaultRules";
import { validateAgentResult } from "@/server/agents/schema";
import {
  loadWatchlistFromDisk,
  mutateWatchlistSnapshot,
  readWatchlistSnapshotSync,
} from "@/server/storage/persistence";
import { buildWatchlistIdentity, identityKey } from "@/server/watchlist/validation";

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
    "watchlist_entries",
    "watchlist_scan_records",
    "token_identities",
    "source_snapshots",
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
    "getWatchlistEntryForWallet",
    "findWatchlistEntry",
    "createWatchlistEntry",
    "deleteWatchlistEntryForWallet",
    "updateWatchlistEntry",
    "createWatchlistScanRecord",
    "getWatchlistScanRecord",
    "getLatestScanForEntry",
    "getPreviousScanForEntry",
    "listWatchlistScanRecordsForEntry",
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
      detail: "Supabase env vars are configured. The MVP adapter still uses in-memory storage for some tables, but watchlist entries and immutable scan records are persisted to a JSON snapshot under `frontend/.data/`. The function API and schema contract are fixed for adapter parity.",
      schema: storageSchemaContract,
    };
  }

  return {
    provider: "memory",
    persistent: true,
    detail: "MVP storage with watchlist persisted to disk under frontend/.data/watchlist.json. Other tables reset when the server process restarts. The function API and schema contract are fixed for adapter parity.",
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

/* -------------------------------------------------------------------------- */
/* Watchlist helpers (file-backed)                                            */
/* -------------------------------------------------------------------------- */


export async function listWatchlistEntries(walletAddress?: string): Promise<WatchlistEntry[]> {
  const shape = await loadWatchlistFromDisk();
  const normalizedWallet = walletAddress
    ? canonicalizeAddress(walletAddress, inferFamily(walletAddress))
    : undefined;

  return shape.entries
    .filter((entry) => !normalizedWallet || canonicalizeAddress(entry.walletAddress, entry.chainFamily) === normalizedWallet)
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
}

export async function getWatchlistEntry(id: string): Promise<WatchlistEntry | undefined> {
  const shape = await loadWatchlistFromDisk();

  return shape.entries.find((entry) => entry.id === id);
}

export async function getWatchlistEntryForWallet(
  id: string,
  walletAddress: string,
): Promise<WatchlistEntry | undefined> {
  const entry = await getWatchlistEntry(id);

  if (!entry) return undefined;

  const expected = canonicalizeAddress(walletAddress, entry.chainFamily);

  if (canonicalizeAddress(entry.walletAddress, entry.chainFamily) !== expected) return undefined;

  return entry;
}

/**
 * Infer chain family from a wallet address for normalisation purposes.
 * Only used to choose the canonical form for list filtering; for actual asset
 * decisions use `chainFamily` from the entry itself.
 */
function inferFamily(address: string): "evm" | "stellar" {
  return address.startsWith("G") && address.length === 56 ? "stellar" : "evm";
}

/**
 * Find a watchlist entry by canonical identity (wallet + chainFamily + network
 * + canonical assetIdentifier). Includes `network` so the same EVM contract on
 * different chains is treated as a distinct entry. Canonicalisation is delegated
 * to the validation module to keep the rules in one place.
 */
export async function findWatchlistEntry(input: {
  walletAddress: string;
  chainFamily: "evm" | "stellar";
  network: string;
  assetIdentifier: string;
}): Promise<WatchlistEntry | undefined> {
  const shape = await loadWatchlistFromDisk();
  const targetIdentity = identityKey(
    buildWatchlistIdentity({
      walletAddress: input.walletAddress,
      chainFamily: input.chainFamily,
      network: input.network,
      assetIdentifier: input.assetIdentifier,
    }),
  );

  return shape.entries.find(
    (entry) =>
      identityKey(
        buildWatchlistIdentity({
          walletAddress: entry.walletAddress,
          chainFamily: entry.chainFamily,
          network: entry.network,
          assetIdentifier: entry.assetIdentifier,
        }),
      ) === targetIdentity,
  );
}

export async function createWatchlistEntry(input: WatchlistEntryInput): Promise<WatchlistEntry> {
  const existing = await findWatchlistEntry({
    walletAddress: input.walletAddress,
    chainFamily: input.chainFamily,
    network: input.network,
    assetIdentifier: input.assetIdentifier,
  });

  if (existing) {
    throw new Error(
      `Watchlist entry already exists for ${input.assetIdentifier} on ${input.network}. ` +
        `Idempotent: entry id ${existing.id}.`,
    );
  }

  const now = new Date().toISOString();
  const entry: WatchlistEntry = {
    id: createRecordId("watch"),
    walletAddress: input.walletAddress,
    chainFamily: input.chainFamily,
    network: input.network,
    assetIdentifier: input.assetIdentifier,
    assetType: input.assetType,
    symbol: input.symbol,
    name: input.name ?? input.symbol,
    previousScanAvailable: false,
    createdAt: now,
    updatedAt: now,
  };

  await mutateWatchlistSnapshot((current) => ({
    ...current,
    entries: [entry, ...current.entries],
  }));

  return entry;
}

export async function deleteWatchlistEntry(id: string): Promise<boolean> {
  const snapshot = await mutateWatchlistSnapshot((current) => {
    const nextEntries = current.entries.filter((entry) => entry.id !== id);

    if (nextEntries.length === current.entries.length) {
      // No row removed; return current so the persistence layer skips a write.
      return current;
    }

    // Cascade delete scan records that belong to the removed entry.
    const nextScans = current.scans.filter((scan) => scan.watchlistEntryId !== id);

    return { ...current, entries: nextEntries, scans: nextScans };
  });

  const stillThere = snapshot.entries.some((entry) => entry.id === id);

  return !stillThere;
}

export async function deleteWatchlistEntryForWallet(id: string, walletAddress: string): Promise<boolean> {
  const entry = await getWatchlistEntryForWallet(id, walletAddress);

  if (!entry) return false;

  return deleteWatchlistEntry(id);
}

export async function updateWatchlistEntry(
  id: string,
  update: Partial<
    Pick<
      WatchlistEntry,
      | "latestScanId"
      | "previousScanId"
      | "latestScanAt"
      | "latestScanStatus"
      | "latestVerdict"
      | "latestRiskScore"
      | "previousVerdict"
      | "previousRiskScore"
      | "previousScanAvailable"
    >
  >,
): Promise<WatchlistEntry | undefined> {
  let nextEntry: WatchlistEntry | undefined;

  await mutateWatchlistSnapshot((current) => {
    const idx = current.entries.findIndex((entry) => entry.id === id);

    if (idx === -1) {
      nextEntry = undefined;
      return current;
    }

    const merged: WatchlistEntry = {
      ...current.entries[idx],
      ...update,
      updatedAt: new Date().toISOString(),
      previousScanAvailable:
        update.previousScanAvailable ?? current.entries[idx].previousScanAvailable,
    };
    const entries = current.entries.slice();
    entries[idx] = merged;
    nextEntry = merged;

    return { ...current, entries };
  });

  return nextEntry;
}

/* ─────────────────────────────  Scan records  ───────────────────────────── */

export type CreateWatchlistScanRecordInput = Omit<
  WatchlistScanRecord,
  "id" | "createdAt"
> & { createdAt?: string };

export async function createWatchlistScanRecord(input: CreateWatchlistScanRecordInput): Promise<WatchlistScanRecord> {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const record: WatchlistScanRecord = {
    ...input,
    id: createRecordId("wscan"),
    createdAt,
  };

  await mutateWatchlistSnapshot((current) => ({
    ...current,
    scans: [record, ...current.scans],
  }));

  return record;
}

export async function getWatchlistScanRecord(id: string): Promise<WatchlistScanRecord | undefined> {
  const shape = await loadWatchlistFromDisk();

  return shape.scans.find((scan) => scan.id === id);
}

export async function listWatchlistScanRecordsForEntry(
  watchlistEntryId: string,
): Promise<WatchlistScanRecord[]> {
  const shape = await loadWatchlistFromDisk();

  return shape.scans
    .filter((scan) => scan.watchlistEntryId === watchlistEntryId)
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
}

export async function getLatestScanForEntry(watchlistEntryId: string): Promise<WatchlistScanRecord | undefined> {
  const records = await listWatchlistScanRecordsForEntry(watchlistEntryId);

  return records[0];
}

export async function getPreviousScanForEntry(
  watchlistEntryId: string,
  currentScanId?: string,
): Promise<WatchlistScanRecord | undefined> {
  const records = await listWatchlistScanRecordsForEntry(watchlistEntryId);

  if (currentScanId) {
    return records.find((scan) => scan.id !== currentScanId);
  }

  return records[1];
}

export function getStorageCounts(): StorageCounts {
  // Counts are synchronous to preserve the existing API; read directly from
  // the cached shape. The watchlist snapshot is loaded on first access and
  // cached for the lifetime of the process, so this stays cheap.
  const cachedShape = readWatchlistSnapshotSync();

  return {
    agentRuns: getAgentRuns().length,
    recommendations: getRecommendations().length,
    transactions: getTransactions().length,
    approvals: getApprovals().length,
    userRules: getUserRules().length,
    watchlistEntries: cachedShape.entries.length,
    watchlistScanRecords: cachedShape.scans.length,
    x402PaymentReceipts: getX402PaymentReceipts().length,
  };
}
