import type { AgentResult, AgentRunRecord, StorageHealth } from "@/server/types";

type CreateAgentRunInput = {
  walletAddress: string;
  targetToken?: AgentRunRecord["targetToken"];
  results: AgentResult[];
};

const memoryStore = globalThis as typeof globalThis & {
  __goldenRaccoonAgentRuns?: AgentRunRecord[];
};

function getAgentRuns() {
  memoryStore.__goldenRaccoonAgentRuns ??= [];

  return memoryStore.__goldenRaccoonAgentRuns;
}

function createId() {
  return `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function getStorageHealth(): StorageHealth {
  const supabaseConfigured = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (supabaseConfigured) {
    return {
      provider: "supabase_postgres",
      persistent: false,
      detail: "Supabase env vars are configured. The MVP adapter still uses in-memory storage until the DB client is wired.",
    };
  }

  return {
    provider: "memory",
    persistent: false,
    detail: "Using in-memory MVP storage. Records reset when the server process restarts.",
  };
}

export function listAgentRunRecords(walletAddress?: string) {
  const normalizedWallet = walletAddress?.toLowerCase();

  return getAgentRuns()
    .filter((record) => !normalizedWallet || record.walletAddress.toLowerCase() === normalizedWallet)
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
}

export function createAgentRunRecord(input: CreateAgentRunInput): AgentRunRecord {
  const decision = [...input.results].reverse().find((result) => result.agent === "decision");
  const failed = input.results.some((result) => result.status === "error" || result.status === "unavailable");
  const completed = input.results.some((result) => result.agent === "decision");
  const record: AgentRunRecord = {
    id: createId(),
    walletAddress: input.walletAddress,
    targetToken: input.targetToken,
    status: completed ? (failed ? "partial" : "completed") : "failed",
    recommendation: decision?.recommendedAction ?? "manual_review",
    decisionScore: decision?.score ?? Math.max(...input.results.map((result) => result.score), 50),
    confidence: decision?.confidence ?? 0.28,
    summary: decision?.summary ?? "Agent run ended before a final decision was produced.",
    results: input.results,
    createdAt: new Date().toISOString(),
  };

  getAgentRuns().unshift(record);

  return record;
}
