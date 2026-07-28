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
import {
  canonicalizeAddress,
  canonicalizeTransactionHash,
  createWalletIdentity,
  getChainFamily,
  isStellarAddress,
  normalizeNetwork,
  resolveChainContext,
  type ChainContext,
} from "@/lib/chainIdentity";

type CreateAgentRunInput = {
  chainFamily?: AgentRunRecord["chainFamily"];
  network?: string;
  walletAddress: string;
  mode?: AgentRunRecord["mode"];
  inputSnapshot?: Record<string, unknown>;
  targetToken?: AgentRunRecord["targetToken"];
  results: AgentResult[];
  userAction?: AgentRunRecord["userAction"];
};

type TransactionRecordInput = Omit<TransactionRecord, "chainFamily" | "createdAt"> & {
  chainFamily?: TransactionRecord["chainFamily"];
  createdAt?: string;
};

type ApprovalRecordInput = Omit<
  UserApprovalRecord,
  "chainFamily" | "id" | "createdAt" | "status" | "autoExecuted"
> & {
  chainFamily?: UserApprovalRecord["chainFamily"];
};

function recordContext(input: {
  chainFamily?: ChainContext["chainFamily"];
  network?: string;
  identifier?: string;
}) {
  const inferredNetwork =
    input.network ??
    (isStellarAddress(input.identifier)
      ? "stellar-testnet"
      : "legacy-evm");

  return resolveChainContext({
    chainFamily: input.chainFamily,
    network: inferredNetwork,
    identifier: input.identifier,
  });
}

function normalizeStoredWallet(address: string, context: ChainContext) {
  const trimmed = address.trim();
  const looksLikeChainIdentifier =
    trimmed.startsWith("0x") ||
    isStellarAddress(trimmed) ||
    /^[GCM][A-Z2-7]{55}$/.test(trimmed);

  if (!looksLikeChainIdentifier) {
    return canonicalizeAddress(trimmed, context.chainFamily);
  }

  return createWalletIdentity({ ...context, address: trimmed }).address;
}

function walletMatches(record: { chainFamily?: ChainContext["chainFamily"]; network?: string; walletAddress: string }, address: string) {
  const candidateFamily = isStellarAddress(address) ? "stellar" : getChainFamily(record.network);
  const recordFamily = record.chainFamily ?? getChainFamily(record.network);

  if (recordFamily !== candidateFamily) return false;

  return canonicalizeAddress(record.walletAddress, recordFamily) === canonicalizeAddress(address, candidateFamily);
}

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
  return getAgentRuns()
    .filter((record) => !walletAddress || walletMatches(record, walletAddress))
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
  const context = recordContext({
    chainFamily: input.chainFamily,
    network: input.network ?? input.targetToken?.network ?? input.targetToken?.chain,
    identifier: input.walletAddress,
  });
  const record: AgentRunRecord = {
    id: createId(),
    ...context,
    walletAddress: normalizeStoredWallet(input.walletAddress, context),
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
    ...context,
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
  return getRecommendations()
    .filter((record) => !walletAddress || walletMatches(record, walletAddress))
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
}

export function createRecommendationRecord(
  input: Omit<RecommendationRecord, "chainFamily" | "network" | "id" | "createdAt"> &
    Partial<Pick<RecommendationRecord, "chainFamily" | "network">>,
) {
  const context = recordContext(input);
  const record: RecommendationRecord = {
    id: createRecordId("rec"),
    createdAt: new Date().toISOString(),
    ...input,
    ...context,
    walletAddress: normalizeStoredWallet(input.walletAddress, context),
  };

  getRecommendations().unshift(record);

  return record;
}

export function listTransactionRecords(walletAddress?: string) {
  return getTransactions()
    .filter(
      (record) =>
        !walletAddress ||
        (record.walletAddress &&
          walletMatches(
            {
              chainFamily: record.chainFamily,
              network: record.network,
              walletAddress: record.walletAddress,
            },
            walletAddress,
          )),
    )
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
}

export function getTransactionRecord(
  hash: string,
  contextInput: Partial<ChainContext> & { network?: string } = {},
) {
  const context = recordContext({
    ...contextInput,
    network: contextInput.network ?? (hash.startsWith("0x") ? "legacy-evm" : undefined),
  });
  const canonicalHash = canonicalizeTransactionHash(hash, context);

  return getTransactions().find(
    (record) =>
      record.chainFamily === context.chainFamily &&
      normalizeNetwork(record.network, record.chainFamily) === context.network &&
      record.hash === canonicalHash,
  );
}

export function createTransactionRecord(input: TransactionRecordInput) {
  const context = recordContext({
    chainFamily: input.chainFamily,
    network: input.network,
    identifier: input.walletAddress,
  });
  const hash = canonicalizeTransactionHash(input.hash, context);
  const existingIndex = getTransactions().findIndex(
    (record) =>
      record.chainFamily === context.chainFamily &&
      normalizeNetwork(record.network, record.chainFamily) === context.network &&
      record.hash === hash,
  );
  const record: TransactionRecord = {
    ...input,
    ...context,
    hash,
    walletAddress: input.walletAddress
      ? normalizeStoredWallet(input.walletAddress, context)
      : undefined,
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
  return getApprovals()
    .filter((record) => !walletAddress || walletMatches(record, walletAddress))
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
}

export function createApprovalRecord(input: ApprovalRecordInput) {
  const context = recordContext({
    chainFamily: input.chainFamily,
    network: input.network ?? (input.txHash.startsWith("0x") ? "legacy-evm" : undefined),
    identifier: input.walletAddress,
  });
  const record: UserApprovalRecord = {
    id: createRecordId("approval"),
    ...input,
    ...context,
    walletAddress: normalizeStoredWallet(input.walletAddress, context),
    txHash: canonicalizeTransactionHash(input.txHash, context),
    status: "confirmed",
    autoExecuted: false,
    createdAt: new Date().toISOString(),
  };

  getApprovals().unshift(record);

  return record;
}

export function getUserRuleRecord(
  walletAddress = "0xDemoWallet",
  contextInput: Partial<ChainContext> = {},
) {
  const existing = getUserRules().find(
    (rule) =>
      walletMatches(
        {
          chainFamily: rule.chainFamily,
          network: rule.network,
          walletAddress: rule.walletAddress,
        },
        walletAddress,
      ) &&
      (!contextInput.network ||
        normalizeNetwork(rule.network ?? "legacy-evm", rule.chainFamily ?? "evm") ===
          normalizeNetwork(contextInput.network, contextInput.chainFamily ?? rule.chainFamily ?? "evm")),
  );

  return {
    ...getDefaultRules(walletAddress, contextInput),
    ...existing,
    autoExecute: false,
  };
}

export function upsertUserRuleRecord(input: UserRule) {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const context = recordContext({
    chainFamily: input.chainFamily,
    network: input.network,
    identifier: input.walletAddress,
  });
  const defaults = getDefaultRules(input.walletAddress, context);
  const record: UserRule = {
    ...defaults,
    ...input,
    ...context,
    walletAddress: normalizeStoredWallet(input.walletAddress, context),
    autoExecute: false,
    createdAt,
  };
  const existingIndex = getUserRules().findIndex(
    (rule) =>
      walletMatches(
        {
          chainFamily: rule.chainFamily,
          network: rule.network,
          walletAddress: rule.walletAddress,
        },
        record.walletAddress,
      ) &&
      normalizeNetwork(rule.network ?? "legacy-evm", rule.chainFamily ?? "evm") === context.network,
  );

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
